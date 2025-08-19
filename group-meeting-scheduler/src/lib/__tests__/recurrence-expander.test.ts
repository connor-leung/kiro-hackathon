import { describe, it, expect } from "vitest";
import { RRule } from "rrule";
import { RecurrenceExpander } from "../recurrence-expander";
import { CalendarEvent, DateRange } from "@/types/calendar";
import { addDays, addWeeks } from "date-fns";

describe("RecurrenceExpander", () => {
  const baseEvent: CalendarEvent = {
    id: "test-event",
    summary: "Test Meeting",
    start: new Date("2023-12-01T12:00:00.000Z"),
    end: new Date("2023-12-01T13:00:00.000Z"),
    timezone: "UTC",
    status: "confirmed",
  };

  const dateRange: DateRange = {
    start: new Date("2023-12-01T00:00:00.000Z"),
    end: new Date("2023-12-31T23:59:59.000Z"),
  };

  describe("expandRecurringEvents", () => {
    it("should return non-recurring events as-is when in range", () => {
      const events = [baseEvent];
      const result = RecurrenceExpander.expandRecurringEvents(
        events,
        dateRange
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(baseEvent);
    });

    it("should filter out non-recurring events outside range", () => {
      const outOfRangeEvent = {
        ...baseEvent,
        start: new Date("2024-01-01T12:00:00.000Z"),
        end: new Date("2024-01-01T13:00:00.000Z"),
      };

      const events = [outOfRangeEvent];
      const result = RecurrenceExpander.expandRecurringEvents(
        events,
        dateRange
      );

      expect(result).toHaveLength(0);
    });

    it("should expand weekly recurring events", () => {
      const recurringEvent: CalendarEvent = {
        ...baseEvent,
        recurrence: new RRule({
          freq: RRule.WEEKLY,
          count: 4,
          dtstart: baseEvent.start,
        }),
      };

      const events = [recurringEvent];
      const result = RecurrenceExpander.expandRecurringEvents(
        events,
        dateRange
      );

      expect(result.length).toBeGreaterThan(1);
      expect(result.length).toBeLessThanOrEqual(4);

      // Check that events are properly spaced
      for (let i = 1; i < result.length; i++) {
        const timeDiff =
          result[i].start.getTime() - result[i - 1].start.getTime();
        expect(timeDiff).toBe(7 * 24 * 60 * 60 * 1000); // 1 week in milliseconds
      }
    });

    it("should expand daily recurring events", () => {
      const recurringEvent: CalendarEvent = {
        ...baseEvent,
        recurrence: new RRule({
          freq: RRule.DAILY,
          count: 5,
          dtstart: baseEvent.start,
        }),
      };

      const events = [recurringEvent];
      const result = RecurrenceExpander.expandRecurringEvents(
        events,
        dateRange
      );

      expect(result.length).toBe(5);

      // Check that events are daily
      for (let i = 1; i < result.length; i++) {
        const timeDiff =
          result[i].start.getTime() - result[i - 1].start.getTime();
        expect(timeDiff).toBe(24 * 60 * 60 * 1000); // 1 day in milliseconds
      }
    });

    it("should respect maxOccurrences limit", () => {
      const recurringEvent: CalendarEvent = {
        ...baseEvent,
        recurrence: new RRule({
          freq: RRule.DAILY,
          count: 100,
          dtstart: baseEvent.start,
        }),
      };

      const events = [recurringEvent];
      const result = RecurrenceExpander.expandRecurringEvents(
        events,
        dateRange,
        10
      );

      expect(result.length).toBeLessThanOrEqual(10);
    });

    it("should generate unique IDs for recurring event instances", () => {
      const recurringEvent: CalendarEvent = {
        ...baseEvent,
        recurrence: new RRule({
          freq: RRule.WEEKLY,
          count: 3,
          dtstart: baseEvent.start,
        }),
      };

      const events = [recurringEvent];
      const result = RecurrenceExpander.expandRecurringEvents(
        events,
        dateRange
      );

      const ids = result.map((e) => e.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(result.length);
      expect(ids.every((id) => id.startsWith("test-event_"))).toBe(true);
    });

    it("should preserve event duration for recurring instances", () => {
      const recurringEvent: CalendarEvent = {
        ...baseEvent,
        recurrence: new RRule({
          freq: RRule.WEEKLY,
          count: 3,
          dtstart: baseEvent.start,
        }),
      };

      const originalDuration =
        baseEvent.end.getTime() - baseEvent.start.getTime();

      const events = [recurringEvent];
      const result = RecurrenceExpander.expandRecurringEvents(
        events,
        dateRange
      );

      for (const event of result) {
        const duration = event.end.getTime() - event.start.getTime();
        expect(duration).toBe(originalDuration);
      }
    });

    it("should sort results by start time", () => {
      const event1: CalendarEvent = {
        ...baseEvent,
        id: "event-1",
        start: new Date("2023-12-05T12:00:00.000Z"),
        end: new Date("2023-12-05T13:00:00.000Z"),
      };

      const event2: CalendarEvent = {
        ...baseEvent,
        id: "event-2",
        start: new Date("2023-12-03T12:00:00.000Z"),
        end: new Date("2023-12-03T13:00:00.000Z"),
      };

      const events = [event1, event2];
      const result = RecurrenceExpander.expandRecurringEvents(
        events,
        dateRange
      );

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("event-2");
      expect(result[1].id).toBe("event-1");
    });
  });

  describe("expandSingleEvent", () => {
    it("should return original event if no recurrence", () => {
      const result = RecurrenceExpander.expandSingleEvent(baseEvent, dateRange);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(baseEvent);
    });

    it("should return empty array if non-recurring event is outside range", () => {
      const outOfRangeEvent = {
        ...baseEvent,
        start: new Date("2024-01-01T12:00:00.000Z"),
        end: new Date("2024-01-01T13:00:00.000Z"),
      };

      const result = RecurrenceExpander.expandSingleEvent(
        outOfRangeEvent,
        dateRange
      );

      expect(result).toHaveLength(0);
    });

    it("should expand recurring event within date range", () => {
      const recurringEvent: CalendarEvent = {
        ...baseEvent,
        recurrence: new RRule({
          freq: RRule.WEEKLY,
          count: 4,
          dtstart: baseEvent.start,
        }),
      };

      const result = RecurrenceExpander.expandSingleEvent(
        recurringEvent,
        dateRange
      );

      expect(result.length).toBeGreaterThan(1);
      expect(result.length).toBeLessThanOrEqual(4);
    });
  });

  describe("eventIntersectsRange", () => {
    it("should return true for event within range", () => {
      const result = RecurrenceExpander.eventIntersectsRange(
        baseEvent,
        dateRange
      );
      expect(result).toBe(true);
    });

    it("should return false for event before range", () => {
      const earlyEvent = {
        ...baseEvent,
        start: new Date("2023-11-01T12:00:00.000Z"),
        end: new Date("2023-11-01T13:00:00.000Z"),
      };

      const result = RecurrenceExpander.eventIntersectsRange(
        earlyEvent,
        dateRange
      );
      expect(result).toBe(false);
    });

    it("should return false for event after range", () => {
      const lateEvent = {
        ...baseEvent,
        start: new Date("2024-01-01T12:00:00.000Z"),
        end: new Date("2024-01-01T13:00:00.000Z"),
      };

      const result = RecurrenceExpander.eventIntersectsRange(
        lateEvent,
        dateRange
      );
      expect(result).toBe(false);
    });

    it("should return true for event that overlaps range start", () => {
      const overlappingEvent = {
        ...baseEvent,
        start: new Date("2023-11-30T23:00:00.000Z"),
        end: new Date("2023-12-01T01:00:00.000Z"),
      };

      const result = RecurrenceExpander.eventIntersectsRange(
        overlappingEvent,
        dateRange
      );
      expect(result).toBe(true);
    });

    it("should return true for event that overlaps range end", () => {
      const overlappingEvent = {
        ...baseEvent,
        start: new Date("2023-12-31T23:00:00.000Z"),
        end: new Date("2024-01-01T01:00:00.000Z"),
      };

      const result = RecurrenceExpander.eventIntersectsRange(
        overlappingEvent,
        dateRange
      );
      expect(result).toBe(true);
    });
  });

  describe("createExpansionRange", () => {
    it("should create range with default buffer", () => {
      const schedulingRange: DateRange = {
        start: new Date("2023-12-01T00:00:00.000Z"),
        end: new Date("2023-12-31T23:59:59.000Z"),
      };

      const result = RecurrenceExpander.createExpansionRange(schedulingRange);

      expect(result.start).toEqual(addDays(schedulingRange.start, -30));
      expect(result.end).toEqual(addDays(schedulingRange.end, 30));
    });

    it("should create range with custom buffer", () => {
      const schedulingRange: DateRange = {
        start: new Date("2023-12-01T00:00:00.000Z"),
        end: new Date("2023-12-31T23:59:59.000Z"),
      };

      const result = RecurrenceExpander.createExpansionRange(
        schedulingRange,
        7
      );

      expect(result.start).toEqual(addDays(schedulingRange.start, -7));
      expect(result.end).toEqual(addDays(schedulingRange.end, 7));
    });
  });

  describe("getNextOccurrences", () => {
    it("should return empty array for non-recurring event in the past", () => {
      const pastEvent = {
        ...baseEvent,
        start: new Date("2023-11-01T12:00:00.000Z"),
        end: new Date("2023-11-01T13:00:00.000Z"),
      };

      const result = RecurrenceExpander.getNextOccurrences(
        pastEvent,
        5,
        new Date("2023-12-01T00:00:00.000Z")
      );

      expect(result).toHaveLength(0);
    });

    it("should return single event for non-recurring future event", () => {
      const futureEvent = {
        ...baseEvent,
        start: new Date("2023-12-15T12:00:00.000Z"),
        end: new Date("2023-12-15T13:00:00.000Z"),
      };

      const result = RecurrenceExpander.getNextOccurrences(
        futureEvent,
        5,
        new Date("2023-12-01T00:00:00.000Z")
      );

      expect(result).toHaveLength(1);
      expect(result[0].start).toEqual(futureEvent.start);
    });

    it("should return next occurrences for recurring event", () => {
      const recurringEvent: CalendarEvent = {
        ...baseEvent,
        recurrence: new RRule({
          freq: RRule.WEEKLY,
          dtstart: baseEvent.start,
        }),
      };

      const result = RecurrenceExpander.getNextOccurrences(
        recurringEvent,
        3,
        new Date("2023-12-05T00:00:00.000Z")
      );

      expect(result.length).toBeLessThanOrEqual(3);
      expect(result.length).toBeGreaterThan(0);

      // All occurrences should be after the specified date
      const afterDate = new Date("2023-12-05T00:00:00.000Z");
      for (const occurrence of result) {
        expect(occurrence.start.getTime()).toBeGreaterThan(afterDate.getTime());
      }
    });
  });

  describe("hasRecurrenceEnded", () => {
    it("should return true for non-recurring events", () => {
      const result = RecurrenceExpander.hasRecurrenceEnded(baseEvent);
      expect(result).toBe(true);
    });

    it("should return false for ongoing recurring events", () => {
      const recurringEvent: CalendarEvent = {
        ...baseEvent,
        recurrence: new RRule({
          freq: RRule.WEEKLY,
          dtstart: baseEvent.start,
        }),
      };

      const result = RecurrenceExpander.hasRecurrenceEnded(
        recurringEvent,
        new Date("2023-12-01T00:00:00.000Z")
      );

      expect(result).toBe(false);
    });

    it("should return true for ended recurring events with count", () => {
      const recurringEvent: CalendarEvent = {
        ...baseEvent,
        recurrence: new RRule({
          freq: RRule.WEEKLY,
          count: 2,
          dtstart: baseEvent.start,
        }),
      };

      const result = RecurrenceExpander.hasRecurrenceEnded(
        recurringEvent,
        new Date("2024-01-01T00:00:00.000Z")
      );

      expect(result).toBe(true);
    });
  });

  describe("validateRecurrenceRule", () => {
    it("should validate reasonable weekly recurrence", () => {
      const rrule = new RRule({
        freq: RRule.WEEKLY,
        count: 10,
        dtstart: new Date(),
      });

      const result = RecurrenceExpander.validateRecurrenceRule(rrule);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("should warn about very frequent recurrence", () => {
      const rrule = new RRule({
        freq: RRule.MINUTELY,
        interval: 5,
        count: 10,
        dtstart: new Date(),
      });

      const result = RecurrenceExpander.validateRecurrenceRule(rrule);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes("frequent"))).toBe(true);
    });

    it("should reject second-level recurrence", () => {
      const rrule = new RRule({
        freq: RRule.SECONDLY,
        count: 10,
        dtstart: new Date(),
      });

      const result = RecurrenceExpander.validateRecurrenceRule(rrule);

      expect(result.isValid).toBe(false);
      expect(result.warnings.some((w) => w.includes("Second-level"))).toBe(
        true
      );
    });

    it("should warn about very high occurrence count", () => {
      const rrule = new RRule({
        freq: RRule.DAILY,
        count: 6000,
        dtstart: new Date(),
      });

      const result = RecurrenceExpander.validateRecurrenceRule(rrule);

      expect(
        result.warnings.some((w) => w.includes("Very high occurrence count"))
      ).toBe(true);
    });
  });
});
