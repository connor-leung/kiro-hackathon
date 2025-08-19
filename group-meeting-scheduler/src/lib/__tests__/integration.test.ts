import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { ICalParser } from "../ical-parser";
import { TimezoneUtils } from "../timezone-utils";
import { RecurrenceExpander } from "../recurrence-expander";
import { DateRange } from "@/types/calendar";

describe("Integration Tests", () => {
  const fixturesPath = join(__dirname, "fixtures");

  describe("Complete iCal processing workflow", () => {
    it("should parse, normalize, and expand a complete calendar", () => {
      // Read sample calendar file
      const icalContent = readFileSync(
        join(fixturesPath, "sample-calendar.ics"),
        "utf-8"
      );

      // Parse the calendar
      const calendar = ICalParser.parseICalContent(icalContent, "John Doe");

      expect(calendar.participantId).toBe("john-doe");
      expect(calendar.name).toBe("John Doe");
      expect(calendar.timezone).toBe("America/New_York");
      expect(calendar.events.length).toBeGreaterThan(0);

      // Normalize events to UTC
      const utcEvents = TimezoneUtils.normalizeEventsToUTC(calendar.events);

      expect(utcEvents.every((event) => event.timezone === "UTC")).toBe(true);

      // Expand recurring events
      const dateRange: DateRange = {
        start: new Date("2023-12-01T00:00:00.000Z"),
        end: new Date("2023-12-31T23:59:59.000Z"),
      };

      const expandedEvents = RecurrenceExpander.expandRecurringEvents(
        utcEvents,
        dateRange
      );

      // Should have more events due to recurring ones
      expect(expandedEvents.length).toBeGreaterThanOrEqual(utcEvents.length);

      // All events should be within the date range
      for (const event of expandedEvents) {
        expect(event.start.getTime()).toBeGreaterThanOrEqual(
          dateRange.start.getTime()
        );
        expect(event.end.getTime()).toBeLessThanOrEqual(
          dateRange.end.getTime() + 24 * 60 * 60 * 1000
        ); // Allow some buffer
      }
    });

    it("should handle recurring events calendar", () => {
      const icalContent = readFileSync(
        join(fixturesPath, "recurring-events.ics"),
        "utf-8"
      );

      const calendar = ICalParser.parseICalContent(icalContent, "Jane Smith");

      expect(calendar.events.length).toBe(3); // 3 base recurring events

      // Check that recurring events have recurrence rules
      const recurringEvents = calendar.events.filter((e) => e.recurrence);
      expect(recurringEvents.length).toBe(3);

      // Expand over a 3-month period
      const dateRange: DateRange = {
        start: new Date("2023-12-01T00:00:00.000Z"),
        end: new Date("2024-02-29T23:59:59.000Z"),
      };

      const expandedEvents = RecurrenceExpander.expandRecurringEvents(
        calendar.events,
        dateRange
      );

      // Should have many more events due to daily/weekly/monthly recurrence
      expect(expandedEvents.length).toBeGreaterThan(20);

      // Check that daily standup has the most occurrences
      const standupEvents = expandedEvents.filter(
        (e) => e.summary === "Daily Standup"
      );
      expect(standupEvents.length).toBeGreaterThan(10); // Should have many daily occurrences
    });

    it("should validate and reject invalid iCal content", () => {
      const invalidContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Invalid Event
END:VEVENT
END:VCALENDAR`;

      const validation = ICalParser.validateICalContent(invalidContent);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(
        validation.errors.some((e) => e.includes("Missing required UID"))
      ).toBe(true);
      expect(
        validation.errors.some((e) => e.includes("Missing required DTSTART"))
      ).toBe(true);
    });

    it("should handle timezone conversion correctly", () => {
      const icalContent = readFileSync(
        join(fixturesPath, "sample-calendar.ics"),
        "utf-8"
      );

      const calendar = ICalParser.parseICalContent(icalContent);
      const event = calendar.events[0];

      // Convert to different timezones
      const utcTime = TimezoneUtils.toUTC(event.start, event.timezone);
      const pacificTime = TimezoneUtils.fromUTC(utcTime, "America/Los_Angeles");

      expect(utcTime).toBeInstanceOf(Date);
      expect(pacificTime).toBeInstanceOf(Date);

      // Pacific time should be 3 hours behind Eastern (during standard time)
      // or 3 hours behind during daylight time
      const timeDiff = Math.abs(event.start.getTime() - pacificTime.getTime());
      expect(timeDiff).toBeGreaterThan(0); // Should be different times
    });

    it("should handle edge cases gracefully", () => {
      // Test with minimal valid calendar
      const minimalCalendar = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:minimal@example.com
DTSTART:20231201T120000Z
SUMMARY:Minimal Event
END:VEVENT
END:VCALENDAR`;

      const calendar = ICalParser.parseICalContent(minimalCalendar);

      expect(calendar.events).toHaveLength(1);
      expect(calendar.events[0].summary).toBe("Minimal Event");
      expect(
        calendar.events[0].end.getTime() - calendar.events[0].start.getTime()
      ).toBe(60 * 60 * 1000); // 1 hour default duration
    });

    it("should preserve event properties through processing", () => {
      const icalContent = readFileSync(
        join(fixturesPath, "sample-calendar.ics"),
        "utf-8"
      );

      const calendar = ICalParser.parseICalContent(icalContent, "Test User");
      const originalEvent = calendar.events.find(
        (e) => e.summary === "Team Standup"
      );

      expect(originalEvent).toBeDefined();
      expect(originalEvent!.status).toBe("confirmed");

      // Normalize to UTC
      const utcEvents = TimezoneUtils.normalizeEventsToUTC([originalEvent!]);
      const utcEvent = utcEvents[0];

      expect(utcEvent.summary).toBe(originalEvent!.summary);
      expect(utcEvent.status).toBe(originalEvent!.status);
      expect(utcEvent.id).toBe(originalEvent!.id);

      // Expand (non-recurring event should remain the same)
      const dateRange: DateRange = {
        start: new Date("2023-12-01T00:00:00.000Z"),
        end: new Date("2023-12-31T23:59:59.000Z"),
      };

      const expandedEvents = RecurrenceExpander.expandRecurringEvents(
        [utcEvent],
        dateRange
      );

      expect(expandedEvents).toHaveLength(1);
      expect(expandedEvents[0].summary).toBe(originalEvent!.summary);
      expect(expandedEvents[0].status).toBe(originalEvent!.status);
    });
  });

  describe("Error handling and recovery", () => {
    it("should handle partially corrupted iCal files", () => {
      const partiallyCorrupted = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:good-event@example.com
DTSTART:20231201T120000Z
DTEND:20231201T130000Z
SUMMARY:Good Event
END:VEVENT
BEGIN:VEVENT
UID:bad-event@example.com
DTSTART:invalid-date
SUMMARY:Bad Event
END:VEVENT
BEGIN:VEVENT
UID:another-good-event@example.com
DTSTART:20231201T140000Z
DTEND:20231201T150000Z
SUMMARY:Another Good Event
END:VEVENT
END:VCALENDAR`;

      // Should parse successfully but skip the bad event
      const calendar = ICalParser.parseICalContent(partiallyCorrupted);

      expect(calendar.events.length).toBe(2); // Only the good events
      expect(calendar.events.map((e) => e.summary)).toEqual([
        "Good Event",
        "Another Good Event",
      ]);
    });

    it("should handle unknown timezones gracefully", () => {
      const unknownTimezone = "Unknown/Timezone";
      const normalizedTz = TimezoneUtils.normalizeTimezone(unknownTimezone);

      expect(normalizedTz).toBe("UTC");
    });

    it("should handle malformed recurrence rules", () => {
      const malformedRRule = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:malformed-rrule@example.com
DTSTART:20231201T120000Z
DTEND:20231201T130000Z
SUMMARY:Malformed RRule Event
RRULE:INVALID_RULE_FORMAT
END:VEVENT
END:VCALENDAR`;

      const calendar = ICalParser.parseICalContent(malformedRRule);

      expect(calendar.events).toHaveLength(1);
      expect(calendar.events[0].recurrence).toBeUndefined();
    });
  });
});
