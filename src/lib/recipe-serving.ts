/** Only an unambiguous serving count supports +/- one serving. Other yields use a factor. */
export function exactServings(value?: string | null): number | null {
  const match = value
    ?.trim()
    .match(/^(?:serves\s+)?(\d+(?:\.\d+)?)\s*(?:servings?)?$/i);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isFinite(count) && count > 0 ? count : null;
}

export function validServingRatio(value: unknown): number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 100
    ? value
    : 1;
}

export function servingLabel(
  value: string | null | undefined,
  ratio: number,
): string {
  const count = exactServings(value);
  if (count !== null) {
    const scaled = Number((count * ratio).toFixed(3));
    return `${scaled} ${scaled === 1 ? "serving" : "servings"}`;
  }
  return value
    ? `${ratio}× recipe · Original yield: ${value}`
    : `${ratio}× recipe`;
}
