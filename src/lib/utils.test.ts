import { describe, it, expect } from "vitest";
import { getWeekDates, formatWeekRange, formatDuration } from "./utils";

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
