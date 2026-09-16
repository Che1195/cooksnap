// Shared server policy: keep admission and generation limits in lockstep.
// Standard tier pricing: https://ai.developer.meta.com/docs/pricing-rate-limits
export const CAPTURE_MODEL = "muse-spark-1.3";
export const CAPTURE_MAX_INPUT_TOKENS = 12_000;
export const CAPTURE_MAX_OUTPUT_TOKENS = 8_000;
export const CAPTURE_MAX_ATTEMPTS = 2;
export const CAPTURE_MAX_ANALYSIS_MS = 45_000;
export const CAPTURE_IMPORT_DEADLINE_MS = 55_000;
export const CAPTURE_RESPONSE_MARGIN_MS = 2_000;
export const CAPTURE_INPUT_MICROS_PER_TOKEN = 1.25;
export const CAPTURE_OUTPUT_MICROS_PER_TOKEN = 4.25;
export const CAPTURE_RESERVED_MICROS = Math.ceil(
  CAPTURE_MAX_ATTEMPTS * (
    CAPTURE_MAX_INPUT_TOKENS * CAPTURE_INPUT_MICROS_PER_TOKEN +
    CAPTURE_MAX_OUTPUT_TOKENS * CAPTURE_OUTPUT_MICROS_PER_TOKEN
  ),
);
