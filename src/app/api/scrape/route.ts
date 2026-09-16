import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { getConvexToken } from "@/lib/convex/server";
import { fetchRenderedHtml } from "@/lib/cloudflare-render";
import {
  SSRFError,
  PayloadTooLargeError,
  readBodyWithLimit,
  resolveAndValidateHost,
} from "@/lib/safe-fetch";
import { pinnedRecipeFetch as safeFetch } from "@/lib/recipe-capture-fetch";
import { selectCaptureSource } from "@/lib/recipe-capture-source";
import { CaptureError, interpretCapture } from "@/lib/recipe-capture-model";
import { CAPTURE_IMPORT_DEADLINE_MS, CAPTURE_RESPONSE_MARGIN_MS } from "@/lib/recipe-capture-policy";
export { isBlockedIP } from "@/lib/safe-fetch";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  const started = Date.now();
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(CAPTURE_IMPORT_DEADLINE_MS)]);
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      capture(request, signal, started),
      new Promise<NextResponse>((resolve) => {
        onAbort = () =>
          resolve(
            NextResponse.json(
              { error: "Recipe import timed out. Please try again." },
              { status: 504 },
            ),
          );
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

async function capture(
  request: NextRequest,
  signal: AbortSignal,
  started: number,
) {
  let stage = "authentication";
  try {
    const session = await auth();
    signal.throwIfAborted();
    if (!session.userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const raw = await readBodyWithLimit(new Response(request.body), 8192);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new CaptureError("Invalid request body.", 400);
    }
    if (!body || typeof body !== "object")
      throw new CaptureError("Invalid request body.", 400);
    const { url, importId } = body as Record<string, unknown>;
    if (
      typeof url !== "string" ||
      url.length > 2048 ||
      typeof importId !== "string" ||
      !/^[a-zA-Z0-9_-]{16,100}$/.test(importId)
    )
      throw new CaptureError("A valid URL and import ID are required.", 400);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new CaptureError(
        "Invalid URL. Please enter a valid web address.",
        400,
      );
    }
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      (parsed.port && !["80", "443"].includes(parsed.port))
    )
      throw new CaptureError(
        "Only public HTTP URLs on standard ports are allowed.",
        400,
      );
    const token = await getConvexToken(session);
    if (!token)
      throw new CaptureError("Please sign in again before importing.", 401);
    signal.throwIfAborted();
    stage = "admission";
    const admission = await fetchMutation(
      api.imports.reserve,
      { importId },
      { token },
    );
    signal.throwIfAborted();
    if (!admission.allowed)
      throw new CaptureError(
        admission.reason === "duplicate"
          ? "This import has already started. Start a new import to retry."
          : admission.reason === "budget"
            ? "Recipe analysis reached its monthly budget. Try again next month."
            : "Too many imports. Please wait before trying again.",
        admission.reason === "duplicate" ? 409 : 429,
        admission.retryAfter || undefined,
      );
    stage = "source_fetch";
    const response = await safeFetch(
      parsed,
      AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    );
    if (!response.ok)
      throw new CaptureError(
        response.status === 403
          ? "Access denied. The site does not allow scraping."
          : response.status === 404
            ? "Page not found. Please check the URL."
            : "The source website is unavailable. Please try again later.",
        response.status === 403 ? 403 : response.status === 429 ? 429 : 422,
        response.status === 429 ? 60 : undefined,
      );
    if (
      !/text\/html|application\/xhtml\+xml/i.test(
        response.headers.get("content-type") ?? "",
      )
    )
      throw new CaptureError("Only HTML recipe pages are supported.", 422);
    const html = await readBodyWithLimit(response, 5 * 1024 * 1024);
    stage = "source_selection";
    let source = selectCaptureSource(html, url);
    let rendered = false;
    // Visible recipes need no renderer merely because markup is absent.
    if (
      source.text.length < 80 ||
      (source.candidate &&
        (!source.candidate.ingredients.length ||
          !source.candidate.instructions.length))
    ) {
      stage = "source_render";
      await resolveAndValidateHost(parsed.hostname);
      const renderedHtml = await fetchRenderedHtml(
        url,
        AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      );
      if (renderedHtml) {
        source = selectCaptureSource(renderedHtml, url);
        rendered = true;
      }
    }
    if (source.text.length < 40)
      throw new CaptureError(
        "No usable recipe content was found. Try another recipe link.",
        422,
      );
    stage = "analysis";
    const { telemetry, ...recipe } = await interpretCapture(
      source,
      signal,
      { deadlineAt: started + CAPTURE_IMPORT_DEADLINE_MS - CAPTURE_RESPONSE_MARGIN_MS },
    );
    signal.throwIfAborted();
    console.info("recipe_capture", {
      ...telemetry,
      extractionMethod: source.method,
      rendered,
      outcome: "success",
      durationMs: Date.now() - started,
    });
    return NextResponse.json({ ...recipe, importId });
  } catch (error) {
    if (error instanceof CaptureError)
      return NextResponse.json(
        { error: error.message },
        {
          status: error.status,
          headers: error.retryAfter
            ? { "Retry-After": String(error.retryAfter) }
            : undefined,
        },
      );
    if (error instanceof SSRFError || error instanceof PayloadTooLargeError)
      return NextResponse.json(
        { error: error.message },
        { status: error instanceof SSRFError ? 400 : 422 },
      );
    if (error instanceof Error && error.message === "SOURCE_TOO_LARGE")
      return NextResponse.json(
        { error: "This recipe is too large to analyze." },
        { status: 422 },
      );
    if (
      signal.aborted ||
      (error instanceof Error &&
        ["TimeoutError", "AbortError"].includes(error.name))
    )
      return NextResponse.json(
        { error: "Recipe import timed out. Please try again." },
        { status: 504 },
      );
    console.error("recipe_capture", {
      outcome: "failed",
      stage,
      errorType: error instanceof Error ? error.name : "UnknownError",
      durationMs: Date.now() - started,
    });
    return NextResponse.json(
      { error: "Recipe import failed. Please try again." },
      { status: 500 },
    );
  }
}
