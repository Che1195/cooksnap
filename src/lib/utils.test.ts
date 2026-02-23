import { describe, it, expect } from "vitest";
import { getWeekDates, formatWeekRange, formatDuration, getTodayISO, getWeekOffsetForDate, parseDurationToISO, formatDurationForEdit } from "./utils";

describe("getWeekDates", () => {
  it("returns 7 dates", () => {
    const dates = getWeekDates(0);
    expect(dates).toHaveLength(7);
  });

  it("returns dates in YYYY-MM-DD format", () => {
    const dates = getWeekDates(0);
    for (const d of dates) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("first date is a Monday", () => {
    const dates = getWeekDates(0);
    const monday = new Date(dates[0] + "T00:00:00");
    expect(monday.getDay()).toBe(1); // Monday = 1
  });

  it("last date is a Sunday", () => {
    const dates = getWeekDates(0);
    const sunday = new Date(dates[6] + "T00:00:00");
    expect(sunday.getDay()).toBe(0); // Sunday = 0
  });

  it("offset +1 returns next week", () => {
    const thisWeek = getWeekDates(0);
    const nextWeek = getWeekDates(1);
    const diff = new Date(nextWeek[0]).getTime() - new Date(thisWeek[0]).getTime();
    expect(diff).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("offset -1 returns previous week", () => {
    const thisWeek = getWeekDates(0);
    const prevWeek = getWeekDates(-1);
    const diff = new Date(thisWeek[0]).getTime() - new Date(prevWeek[0]).getTime();
    expect(diff).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("formatWeekRange", () => {
  it("formats a week range", () => {
    const dates = [
      "2026-02-16",
      "2026-02-17",
      "2026-02-18",
      "2026-02-19",
      "2026-02-20",
      "2026-02-21",
      "2026-02-22",
    ];
    const result = formatWeekRange(dates);
    expect(result).toContain("Feb");
    expect(result).toContain("16");
    expect(result).toContain("22");
  });

  it("returns empty string for empty array", () => {
    expect(formatWeekRange([])).toBe("");
  });

  it("returns single date for array with one element", () => {
    const result = formatWeekRange(["2026-02-16"]);
    expect(result).toContain("Feb");
    expect(result).toContain("16");
    expect(result).not.toContain("–");
  });

  it("handles short arrays (less than 7 dates) without crashing", () => {
    const dates = ["2026-02-16", "2026-02-17", "2026-02-18"];
    const result = formatWeekRange(dates);
    expect(result).toContain("Feb");
    expect(result).toContain("16");
    expect(result).toContain("18");
    expect(result).toContain("–");
  });
});

describe("formatDuration", () => {
  it("returns null for null input", () => {
    expect(formatDuration(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(formatDuration(undefined)).toBeNull();
  });

  it("parses PT30M as 30m", () => {
    expect(formatDuration("PT30M")).toBe("30m");
  });

  it("parses PT1H as 1h", () => {
    expect(formatDuration("PT1H")).toBe("1h");
  });

  it("parses PT1H30M as 1h 30m", () => {
    expect(formatDuration("PT1H30M")).toBe("1h 30m");
  });

  it("parses PT2H15M", () => {
    expect(formatDuration("PT2H15M")).toBe("2h 15m");
  });

  it("returns non-ISO string as-is", () => {
    expect(formatDuration("30 minutes")).toBe("30 minutes");
  });

  it("returns null for empty PT", () => {
    expect(formatDuration("PT")).toBeNull();
  });
});

describe("getWeekOffsetForDate", () => {
  it("returns 0 for a date in the current week", () => {
    const today = new Date();
    expect(getWeekOffsetForDate(today)).toBe(0);
  });

  it("returns 1 for a date exactly 7 days from now", () => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    expect(getWeekOffsetForDate(nextWeek)).toBe(1);
  });

  it("returns -1 for a date 7 days ago", () => {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    expect(getWeekOffsetForDate(lastWeek)).toBe(-1);
  });

  it("returns correct offset for a date several weeks away", () => {
    const fourWeeksOut = new Date();
    fourWeeksOut.setDate(fourWeeksOut.getDate() + 28);
    expect(getWeekOffsetForDate(fourWeeksOut)).toBe(4);
  });

  it("handles Sunday correctly (last day of week)", () => {
    // Find next Sunday
    const date = new Date();
    const daysUntilSunday = (7 - date.getDay()) % 7;
    const sunday = new Date(date);
    sunday.setDate(date.getDate() + daysUntilSunday);
    // Sunday belongs to the same week as the preceding Monday
    const expectedOffset = daysUntilSunday === 0 ? 0 : daysUntilSunday <= 6 ? 0 : 1;
    expect(getWeekOffsetForDate(sunday)).toBe(expectedOffset);
  });

  it("is consistent with getWeekDates", () => {
    // Pick a date 3 weeks from now, get its offset, then verify getWeekDates
    // with that offset produces a range containing the date
    const target = new Date();
    target.setDate(target.getDate() + 21);
    const offset = getWeekOffsetForDate(target);
    const weekDates = getWeekDates(offset);
    const targetISO = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
    expect(weekDates).toContain(targetISO);
  });
});

describe("getTodayISO", () => {
  it("returns a string in YYYY-MM-DD format", () => {
    const result = getTodayISO();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("matches today's date components", () => {
    const result = getTodayISO();
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(result).toBe(expected);
  });
});

describe("parseDurationToISO – edge cases", () => {
  it("returns null for empty string", () => {
    expect(parseDurationToISO("")).toBeNull();
  });

  it("returns null for non-duration text like 'hello world'", () => {
    expect(parseDurationToISO("hello world")).toBeNull();
  });

  it("parses '45 min' as PT45M (minutes-only input)", () => {
    expect(parseDurationToISO("45 min")).toBe("PT45M");
  });

  it("parses '2 hr' as PT2H (hours-only input)", () => {
    expect(parseDurationToISO("2 hr")).toBe("PT2H");
  });

  it("parses '30 minutes' as PT30M (plural minutes)", () => {
    expect(parseDurationToISO("30 minutes")).toBe("PT30M");
  });

  it("parses '2 hours' as PT2H (plural hours)", () => {
    expect(parseDurationToISO("2 hours")).toBe("PT2H");
  });

  it("parses '2 hours 30 minutes' as PT2H30M (combined plural)", () => {
    expect(parseDurationToISO("2 hours 30 minutes")).toBe("PT2H30M");
  });

  it("parses '1h30m' as PT1H30M (concatenated format)", () => {
    expect(parseDurationToISO("1h30m")).toBe("PT1H30M");
  });

  it("parses '45 mins' as PT45M (plural mins)", () => {
    expect(parseDurationToISO("45 mins")).toBe("PT45M");
  });

  it("returns null for 0:0", () => {
    expect(parseDurationToISO("0:0")).toBeNull();
    expect(parseDurationToISO("0:00")).toBeNull();
    expect(parseDurationToISO("00:00")).toBeNull();
  });
});

describe("formatDurationForEdit – edge cases", () => {
  it("returns empty string for null input", () => {
    expect(formatDurationForEdit(null)).toBe("");
  });

  it("returns empty string for undefined input", () => {
    expect(formatDurationForEdit(undefined)).toBe("");
  });

  it("returns the input string as-is for non-ISO duration like 'not-a-duration'", () => {
    // formatDurationForEdit falls through to returning the raw string when regex doesn't match
    expect(formatDurationForEdit("not-a-duration")).toBe("not-a-duration");
  });
});
