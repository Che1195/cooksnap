/**
 * POST /api/persist-image — copies a recipe's scraped image into Supabase
 * Storage so the recipe book doesn't rot when origin sites move their CDNs.
 *
 * Body: { recipeId: string, imageUrl: string }
 * - imageUrl may be an http(s) URL (fetched with the shared SSRF controls)
 *   or a data:image/... URI (camera capture path) — decoded directly.
 * - The recipe must belong to the authenticated user.
 * - On success the recipe's image column is updated to the storage URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  SSRFError,
  PayloadTooLargeError,
  safeFetch,
  readBytesWithLimit,
} from "@/lib/safe-fetch";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // matches the scrape route's cap
const FETCH_TIMEOUT_MS = 15_000;
const BUCKET = "recipe-images";

/** Allowed image content types and their file extensions. */
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

/** Decode a data:image/...;base64,... URI. Returns null when invalid. */
function decodeDataUri(uri: string): { bytes: Uint8Array; contentType: string } | null {
  const match = uri.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/i);
  if (!match) return null;
  const contentType = match[1].toLowerCase();
  if (!IMAGE_EXTENSIONS[contentType]) return null;
  try {
    const bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
    return { bytes, contentType };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    const { recipeId, imageUrl } = body as { recipeId?: string; imageUrl?: string };

    if (!recipeId || typeof recipeId !== "string" || !imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json(
        { error: "recipeId and imageUrl are required." },
        { status: 400 }
      );
    }

    // Ownership check — never write into another user's recipe row.
    const { data: owned } = await supabase
      .from("recipes")
      .select("id")
      .eq("id", recipeId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!owned) {
      return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
    }

    // --- Obtain the image bytes -------------------------------------------
    let bytes: Uint8Array;
    let contentType: string;

    const dataImage = imageUrl.startsWith("data:") ? decodeDataUri(imageUrl) : null;
    if (imageUrl.startsWith("data:")) {
      if (!dataImage) {
        return NextResponse.json(
          { error: "Unsupported or oversized data URI." },
          { status: 422 }
        );
      }
      bytes = dataImage.bytes;
      contentType = dataImage.contentType;
    } else {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(imageUrl);
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          throw new Error("Invalid protocol");
        }
      } catch {
        return NextResponse.json({ error: "Invalid image URL." }, { status: 400 });
      }

      if (parsedUrl.port && !["80", "443", ""].includes(parsedUrl.port)) {
        return NextResponse.json(
          { error: "Only standard HTTP ports (80, 443) are allowed." },
          { status: 400 }
        );
      }

      const response = await safeFetch(
        parsedUrl,
        AbortSignal.timeout(FETCH_TIMEOUT_MS),
        "image/*"
      );

      if (!response.ok) {
        return NextResponse.json(
          { error: `Failed to fetch image (${response.status}).` },
          { status: 502 }
        );
      }

      contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!IMAGE_EXTENSIONS[contentType]) {
        return NextResponse.json(
          { error: "The URL did not return a supported image." },
          { status: 422 }
        );
      }

      bytes = await readBytesWithLimit(response, MAX_IMAGE_BYTES);
    }

    // --- Upload + point the recipe at the stored copy ----------------------
    const path = `${user.id}/${recipeId}.${IMAGE_EXTENSIONS[contentType]}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType, upsert: true });
    if (uploadError) {
      console.error("Image upload failed:", uploadError.message);
      return NextResponse.json({ error: "Failed to store image." }, { status: 502 });
    }

    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = publicUrlData.publicUrl;

    const { error: updateError } = await supabase
      .from("recipes")
      .update({ image: publicUrl })
      .eq("id", recipeId)
      .eq("user_id", user.id);
    if (updateError) {
      console.error("Recipe image update failed:", updateError.message);
      return NextResponse.json({ error: "Failed to update recipe." }, { status: 502 });
    }

    return NextResponse.json({ image: publicUrl });
  } catch (error) {
    if (error instanceof SSRFError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    const err = error as { name?: string };
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return NextResponse.json({ error: "Image fetch timed out." }, { status: 504 });
    }
    console.error("persist-image error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
