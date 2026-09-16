import type { ReactNode } from "react";

/** Render only the source-linked spans selected by projectRecipe. */
export function highlightIngredients(
  text: string,
  highlights: ReadonlyArray<{ start: number; end: number }> = [],
): ReactNode {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const { start, end } of highlights) {
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < cursor ||
      end <= start ||
      end > text.length
    )
      continue;
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <span key={`${start}-${end}`} className="font-semibold text-primary">
        {text.slice(start, end)}
      </span>,
    );
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length ? parts : text;
}
