import { describe, it, expect } from "vitest";
import { TimezoneUtils } from "../timezone-utils";
import { CalendarEvent } from "@/types/calendar";

describe("TimezoneUtils", () => {
  describe("toUTC", () => {
    it("should return the same date for UTC timezone", () => {
      const date = new Date("2023-12-01T12:00:00.000Z");
      const result = TimezoneUtils.toUTC(date, "UTC");

      expect(result.getTime()).toBe(date.getTime());
    });

    it("should return the same date when no timezone is provided", () => {
      const date = new Date("2023-12-01T12:00:00.000Z");
      const result = TimezoneUtils.toUTC(date);

      expect(result.getTime()).toBe(date.getTime());
    });

    it("should handle timezone conversion", () => {
      const date = new Date("2023-12-01T12:00:00");
      const result = TimezoneUtils.toUTC(date, "America/New_York");

      // Result should be a valid date
      expect(result).toBeInstanceOf(Date);
      expect(isNaN(result.getTime())).toBe(false);
    });

    it("should handle invalid timezone gracefully", () => {
      const date = new Date("2023-12-01T12:00:00.000Z");
      const result = TimezoneUtils.toUTC(date, "Invalid/Timezone");

      // Should return original date when timezone is invalid
      expect(result.getTime()).toBe(date.getTime());
    });
  });

  describe("fromUTC", () => {
    it("should return the same date for UTC timezone", () => {
      const date = new Date("2023-12-01T12:00:00.000Z");
      const result = TimezoneUtils.fromUTC(date, "UTC");

      expect(result.getTime()).toBe(date.getTime());
    });

    it("should handle timezone conversion from UTC", () => {
      const utcDate = new Date("2023-12-01T17:00:00.000Z");
      const result = TimezoneUtils.fromUTC(utcDate, "America/New_York");

      // Result should be a valid date
      expect(result).toBeInstanceOf(Date);
      expect(isNaN(result.getTime())).toBe(false);
    });

    it("should handle invalid timezone gracefully", () => {
      const date = new Date("2023-12-01T12:00:00.000Z");
      const result = TimezoneUtils.fromUTC(date, "Invalid/Timezone");

      // Should return original date when timezone is invalid
      expect(result.getTime()).toBe(date.getTime());
    });
  });

  describe("normalizeEventsToUTC", () => {
    it("should normalize all events to UTC", () => {
      const events: CalendarEvent[] = [
        {
          id: "event-1",
          summary: "Meeting 1",
          start: new Date("2023-12-01T12:00:00"),
          end: new Date("2023-12-01T13:00:00"),
          timezone: "America/New_York",
          status: "confirmed",
        },
        {
          id: "event-2",
          summary: "Meeting 2",
          start: new Date("2023-12-01T14:00:00"),
          end: new Date("2023-12-01T15:00:00"),
          timezone: "Europe/London",
          status: "confirmed",
        },
      ];

      const result = TimezoneUtils.normalizeEventsToUTC(events);

      expect(result).toHaveLength(2);
      expect(result[0].timezone).toBe("UTC");
      expect(result[1].timezone).toBe("UTC");
      expect(result[0].id).toBe("event-1");
      expect(result[1].id).toBe("event-2");
    });

    it("should handle events already in UTC", () => {
      const events: CalendarEvent[] = [
        {
          id: "event-1",
          summary: "Meeting 1",
          start: new Date("2023-12-01T12:00:00.000Z"),
          end: new Date("2023-12-01T13:00:00.000Z"),
          timezone: "UTC",
          status: "confirmed",
        },
      ];

      const result = TimezoneUtils.normalizeEventsToUTC(events);

      expect(result).toHaveLength(1);
      expect(result[0].timezone).toBe("UTC");
      expect(result[0].start.getTime()).toBe(events[0].start.getTime());
      expect(result[0].end.getTime()).toBe(events[0].end.getTime());
    });
  });

  describe("getDetectedTimezone", () => {
    it("should return a valid timezone string", () => {
      const timezone = TimezoneUtils.getDetectedTimezone();

      expect(typeof timezone).toBe("string");
      expect(timezone.length).toBeGreaterThan(0);
      // Should be a valid IANA timezone or UTC
      expect(TimezoneUtils.isValidTimezone(timezone)).toBe(true);
    });
  });

  describe("isValidTimezone", () => {
    it("should validate common timezones", () => {
      expect(TimezoneUtils.isValidTimezone("UTC")).toBe(true);
      expect(TimezoneUtils.isValidTimezone("America/New_York")).toBe(true);
      expect(TimezoneUtils.isValidTimezone("Europe/London")).toBe(true);
      expect(TimezoneUtils.isValidTimezone("Asia/Tokyo")).toBe(true);
    });

    it("should reject invalid timezones", () => {
      expect(TimezoneUtils.isValidTimezone("Invalid/Timezone")).toBe(false);
      expect(TimezoneUtils.isValidTimezone("")).toBe(false);
      expect(TimezoneUtils.isValidTimezone("Not_A_Timezone")).toBe(false);
    });
  });

  describe("formatInTimezone", () => {
    it("should format date in specified timezone", () => {
      const date = new Date("2023-12-01T17:00:00.000Z");
      const result = TimezoneUtils.formatInTimezone(
        date,
        "UTC",
        "yyyy-MM-dd HH:mm"
      );

      expect(typeof result).toBe("string");
      expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    });

    it("should handle invalid timezone gracefully", () => {
      const date = new Date("2023-12-01T17:00:00.000Z");
      const result = TimezoneUtils.formatInTimezone(
        date,
        "Invalid/Timezone",
        "yyyy-MM-dd"
      );

      expect(typeof result).toBe("string");
      expect(result).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it("should use default format when not specified", () => {
      const date = new Date("2023-12-01T17:00:00.000Z");
      const result = TimezoneUtils.formatInTimezone(date, "UTC");

      expect(typeof result).toBe("string");
      expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });
  });

  describe("getTimezoneOffset", () => {
    it("should return 0 for UTC", () => {
      const date = new Date("2023-12-01T12:00:00.000Z");
      const offset = TimezoneUtils.getTimezoneOffset(date, "UTC");

      expect(typeof offset).toBe("number");
    });

    it("should handle invalid timezone gracefully", () => {
      const date = new Date("2023-12-01T12:00:00.000Z");
      const offset = TimezoneUtils.getTimezoneOffset(date, "Invalid/Timezone");

      expect(offset).toBe(0);
    });
  });

  describe("normalizeTimezone", () => {
    it("should return valid IANA timezones unchanged", () => {
      expect(TimezoneUtils.normalizeTimezone("America/New_York")).toBe(
        "America/New_York"
      );
      expect(TimezoneUtils.normalizeTimezone("Europe/London")).toBe(
        "Europe/London"
      );
      expect(TimezoneUtils.normalizeTimezone("UTC")).toBe("UTC");
    });

    it("should map common timezone names", () => {
      expect(TimezoneUtils.normalizeTimezone("Eastern Standard Time")).toBe(
        "America/New_York"
      );
      expect(TimezoneUtils.normalizeTimezone("GMT")).toBe("UTC");
      expect(TimezoneUtils.normalizeTimezone("Greenwich Mean Time")).toBe(
        "UTC"
      );
    });

    it("should default to UTC for unknown timezones", () => {
      expect(TimezoneUtils.normalizeTimezone("Unknown Timezone")).toBe("UTC");
      expect(TimezoneUtils.normalizeTimezone("")).toBe("UTC");
    });
  });

  describe("TIMEZONE_MAPPINGS", () => {
    it("should contain common timezone mappings", () => {
      const mappings = TimezoneUtils.TIMEZONE_MAPPINGS;

      expect(mappings["GMT"]).toBe("UTC");
      expect(mappings["Eastern Standard Time"]).toBe("America/New_York");
      expect(mappings["Pacific Standard Time"]).toBe("America/Los_Angeles");
    });

    it("should map to valid IANA timezones", () => {
      const mappings = TimezoneUtils.TIMEZONE_MAPPINGS;

      for (const [key, value] of Object.entries(mappings)) {
        expect(TimezoneUtils.isValidTimezone(value)).toBe(true);
      }
    });
  });
});
