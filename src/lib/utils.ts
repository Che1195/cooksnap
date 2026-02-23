import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/** Merges and deduplicates Tailwind CSS class names using clsx and tailwind-merge. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getWeekDates(offset: number = 0): string[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset + offset * 7);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });
}

export function formatWeekRange(dates: string[]): string {
  if (dates.length === 0) return "";
  const start = new Date(dates[0] + "T00:00:00");
  const end = new Date(dates[dates.length - 1] + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (dates.length === 1) return start.toLocaleDateString("en-US", opts);
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", opts)}`;
}

/** Returns today's date as YYYY-MM-DD in local time. */
export function getTodayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Calculates the week offset (relative to the current week) for a given date.
 * Used by the schedule picker to jump to the week containing a user-selected date.
 * Returns 0 for dates in the current week, positive for future weeks, negative for past.
 */
export function getWeekOffsetForDate(date: Date): number {
  const today = new Date();
  // Get Monday of the selected date's week
  const dayOfWeek = date.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const selectedMonday = new Date(date);
  selectedMonday.setDate(date.getDate() + mondayOffset);
  // Get Monday of current week
  const todayDayOfWeek = today.getDay();
  const todayMondayOffset = todayDayOfWeek === 0 ? -6 : 1 - todayDayOfWeek;
  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() + todayMondayOffset);
  // Diff in weeks
  const diffMs = selectedMonday.getTime() - currentMonday.getTime();
  return Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
}

export function formatDuration(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return iso;
  const hours = match[1] ? parseInt(match[1]) : 0;
  const minutes = match[2] ? parseInt(match[2]) : 0;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  if (minutes) return `${minutes}m`;
  return null;
}

/** Converts an ISO 8601 duration (e.g. "PT1H30M") to a human-readable edit string (e.g. "1 hr 30 min"). Returns empty string for null/invalid input. */
export function formatDurationForEdit(iso: string | null | undefined): string {
  if (!iso) return "";
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return iso;
  const hours = match[1] ? parseInt(match[1]) : 0;
  const minutes = match[2] ? parseInt(match[2]) : 0;
  if (hours && minutes) return `${hours} hr ${minutes} min`;
  if (hours) return `${hours} hr`;
  if (minutes) return `${minutes} min`;
  return "";
}

/**
 * Parses a human-friendly duration string into ISO 8601 format.
 * Accepts formats like "5 min", "1 hr 30 min", "90", "1h 30m", "1:30".
 * Returns the original string if already ISO, or null if empty/unparseable.
 */
export function parseDurationToISO(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Already ISO 8601
  if (/^PT(\d+H)?(\d+M)?$/.test(trimmed) && trimmed !== "PT") return trimmed;

  // "1:30" format
  const colonMatch = trimmed.match(/^(\d+):(\d+)$/);
  if (colonMatch) {
    const h = parseInt(colonMatch[1]);
    const m = parseInt(colonMatch[2]);
    if (!h && !m) return null;
    return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}`;
  }

  // Extract hours and minutes from natural language
  let hours = 0;
  let minutes = 0;

  const hrMatch = trimmed.match(/(\d+)\s*(?:hr|hour|h)\b/i);
  if (hrMatch) hours = parseInt(hrMatch[1]);

  const minMatch = trimmed.match(/(\d+)\s*(?:min|minute|m)\b/i);
  if (minMatch) minutes = parseInt(minMatch[1]);

  // Plain number — treat as minutes
  if (!hours && !minutes) {
    const plainNum = trimmed.match(/^(\d+)$/);
    if (plainNum) minutes = parseInt(plainNum[1]);
  }

  if (!hours && !minutes) return null;
  return `PT${hours ? `${hours}H` : ""}${minutes ? `${minutes}M` : ""}`;
}
