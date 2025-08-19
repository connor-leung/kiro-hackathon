import { describe, it, expect, beforeEach, vi } from "vitest";
import { CalendarEvent, ParticipantCalendar } from "@/types/calendar";

// Mock the dependencies before importing
vi.mock("../ical-parser", () => ({
  ICalParser: {
    parseICalContent: vi.fn(),
  },
  ICalParseError: class extends Error {},
  ICalValidationError: class extends Error {},
}));

vi.mock("../timezone-utils", () => ({
  TimezoneUtils: {
    toUTC: vi.fn((date: Date) => date),
  },
}));

vi.mock("../recurrence-expander", () => ({
  RecurrenceExpander: {
    expandRecurrence: vi.fn((event: CalendarEvent) => [event]),
  },
}));

// Now import the module under test
import {
  CalendarProcessor,
  CalendarProcessingError,
} from "../calendar-processor";

describe("CalendarProcessor", () => {
  const mockEvent1: CalendarEvent = {
    id: "event1",
    summary: "Meeting 1",
    start: new Date("2024-01-15T10:00:00Z"),
    end: new Date("2024-01-15T11:00:00Z"),
    timezone: "UTC",
    status: "confirmed",
  };

  const mockEvent2: CalendarEvent = {
    id: "event2",
    summary: "Meeting 2",
    start: new Date("2024-01-15T10:30:00Z"),
    end: new Date("2024-01-15T11:30:00Z"),
    timezone: "UTC",
    status: "confirmed",
  };

  const mockEvent3: CalendarEvent = {
    id: "event3",
    summary: "Meeting 3",
    start: new Date("2024-01-15T14:00:00Z"),
    end: new Date("2024-01-15T15:00:00Z"),
    timezone: "UTC",
    status: "confirmed",
  };

  const mockCalendar: ParticipantCalendar = {
    participantId: "participant1",
    name: "John Doe",
    timezone: "UTC",
    events: [mockEvent1, mockEvent2, mockEvent3],
    source: "ical",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("normalizeCalendarData", () => {
    it("should normalize Google Calendar data successfully", () => {
      const mockGoogleData = {
        items: [
          {
            id: "google-event-1",
            summary: "Google Meeting",
            start: { dateTime: "2024-01-15T10:00:00Z", timeZone: "UTC" },
            end: { dateTime: "2024-01-15T11:00:00Z", timeZone: "UTC" },
            status: "confirmed",
          },
        ],
        timeZone: "UTC",
      };

      const result = CalendarProcessor.normalizeCalendarData(
        mockGoogleData,
        "google",
        "Jane Doe"
      );

      expect(result.calendar.source).toBe("google");
      expect(result.calendar.name).toBe("Jane Doe");
      expect(result.calendar.events).toHaveLength(1);
      expect(result.calendar.events[0].summary).toBe("Google Meeting");
    });

    it("should normalize Outlook Calendar data successfully", () => {
      const mockOutlookData = {
        value: [
          {
            id: "outlook-event-1",
            subject: "Outlook Meeting",
            start: { dateTime: "2024-01-15T10:00:00Z", timeZone: "UTC" },
            end: { dateTime: "2024-01-15T11:00:00Z", timeZone: "UTC" },
            showAs: "busy",
          },
        ],
      };

      const result = CalendarProcessor.normalizeCalendarData(
        mockOutlookData,
        "outlook",
        "Bob Smith"
      );

      expect(result.calendar.source).toBe("outlook");
      expect(result.calendar.name).toBe("Bob Smith");
      expect(result.calendar.events).toHaveLength(1);
      expect(result.calendar.events[0].summary).toBe("Outlook Meeting");
    });

    it("should handle invalid Google Calendar data", () => {
      const invalidGoogleData = { invalid: "data" };

      expect(() =>
        CalendarProcessor.normalizeCalendarData(
          invalidGoogleData,
          "google",
          "Jane Doe"
        )
      ).toThrow(CalendarProcessingError);
    });

    it("should handle invalid Outlook Calendar data", () => {
      const invalidOutlookData = { invalid: "data" };

      expect(() =>
        CalendarProcessor.normalizeCalendarData(
          invalidOutlookData,
          "outlook",
          "Bob Smith"
        )
      ).toThrow(CalendarProcessingError);
    });

    it("should handle unsupported calendar source", () => {
      expect(() =>
        CalendarProcessor.normalizeCalendarData(
          {},
          "unsupported" as any,
          "User"
        )
      ).toThrow(CalendarProcessingError);
    });

    it("should handle Google Calendar all-day events", () => {
      const mockGoogleData = {
        items: [
          {
            id: "all-day-event",
            summary: "All Day Meeting",
            start: { date: "2024-01-15" },
            end: { date: "2024-01-16" },
            status: "confirmed",
          },
        ],
        timeZone: "UTC",
      };

      const result = CalendarProcessor.normalizeCalendarData(
        mockGoogleData,
        "google",
        "Jane Doe"
      );

      expect(result.calendar.events).toHaveLength(1);
      expect(result.calendar.events[0].summary).toBe("All Day Meeting");
      expect(result.calendar.events[0].start).toBeInstanceOf(Date);
      expect(result.calendar.events[0].end).toBeInstanceOf(Date);
    });

    it("should handle Google Calendar events without end time", () => {
      const mockGoogleData = {
        items: [
          {
            id: "no-end-event",
            summary: "No End Meeting",
            start: { dateTime: "2024-01-15T10:00:00Z", timeZone: "UTC" },
            status: "confirmed",
          },
        ],
        timeZone: "UTC",
      };

      const result = CalendarProcessor.normalizeCalendarData(
        mockGoogleData,
        "google",
        "Jane Doe"
      );

      expect(result.calendar.events).toHaveLength(1);
      expect(result.calendar.events[0].end.getTime()).toBeGreaterThan(
        result.calendar.events[0].start.getTime()
      );
    });

    it("should map Google Calendar status correctly", () => {
      const mockGoogleData = {
        items: [
          {
            id: "tentative-event",
            summary: "Tentative Meeting",
            start: { dateTime: "2024-01-15T10:00:00Z", timeZone: "UTC" },
            end: { dateTime: "2024-01-15T11:00:00Z", timeZone: "UTC" },
            status: "tentative",
          },
          {
            id: "cancelled-event",
            summary: "Cancelled Meeting",
            start: { dateTime: "2024-01-15T12:00:00Z", timeZone: "UTC" },
            end: { dateTime: "2024-01-15T13:00:00Z", timeZone: "UTC" },
            status: "cancelled",
          },
        ],
        timeZone: "UTC",
      };

      const result = CalendarProcessor.normalizeCalendarData(
        mockGoogleData,
        "google",
        "Jane Doe"
      );

      expect(result.calendar.events).toHaveLength(1); // Cancelled event should be filtered out
      expect(result.calendar.events[0].status).toBe("tentative");
      expect(result.warnings).toContain(
        "Skipping cancelled event: Cancelled Meeting (cancelled-event)"
      );
    });

    it("should map Outlook Calendar status correctly", () => {
      const mockOutlookData = {
        value: [
          {
            id: "tentative-event",
            subject: "Tentative Meeting",
            start: { dateTime: "2024-01-15T10:00:00Z", timeZone: "UTC" },
            end: { dateTime: "2024-01-15T11:00:00Z", timeZone: "UTC" },
            showAs: "tentative",
          },
          {
            id: "free-event",
            subject: "Free Meeting",
            start: { dateTime: "2024-01-15T12:00:00Z", timeZone: "UTC" },
            end: { dateTime: "2024-01-15T13:00:00Z", timeZone: "UTC" },
            showAs: "free",
          },
        ],
      };

      const result = CalendarProcessor.normalizeCalendarData(
        mockOutlookData,
        "outlook",
        "Bob Smith"
      );

      expect(result.calendar.events).toHaveLength(1); // Free event should be filtered out
      expect(result.calendar.events[0].status).toBe("tentative");
      expect(result.warnings).toContain(
        "Skipping cancelled event: Free Meeting (free-event)"
      );
    });
  });

  describe("detectConflicts", () => {
    it("should detect conflicts within a single participant's calendar", () => {
      const result = CalendarProcessor.detectConflicts([mockCalendar]);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].participantId).toBe("participant1");
      expect(result.conflicts[0].event1.id).toBe("event1");
      expect(result.conflicts[0].event2.id).toBe("event2");
      expect(result.conflicts[0].overlapDuration).toBe(30); // 30 minutes overlap
    });

    it("should generate busy periods correctly", () => {
      const result = CalendarProcessor.detectConflicts([mockCalendar]);

      expect(result.busyPeriods).toHaveLength(2);

      // First busy period should merge overlapping events
      const firstPeriod = result.busyPeriods.find(
        (p) => p.start.getTime() === mockEvent1.start.getTime()
      );
      expect(firstPeriod).toBeDefined();
      expect(firstPeriod!.eventIds).toContain("event1");
      expect(firstPeriod!.eventIds).toContain("event2");

      // Second busy period should be separate
      const secondPeriod = result.busyPeriods.find(
        (p) => p.start.getTime() === mockEvent3.start.getTime()
      );
      expect(secondPeriod).toBeDefined();
      expect(secondPeriod!.eventIds).toEqual(["event3"]);
    });

    it("should handle calendar with no conflicts", () => {
      const noConflictCalendar: ParticipantCalendar = {
        ...mockCalendar,
        events: [
          mockEvent1,
          {
            ...mockEvent3,
            start: new Date("2024-01-15T12:00:00Z"),
            end: new Date("2024-01-15T13:00:00Z"),
          },
        ],
      };

      const result = CalendarProcessor.detectConflicts([noConflictCalendar]);

      expect(result.hasConflicts).toBe(false);
      expect(result.conflicts).toHaveLength(0);
      expect(result.busyPeriods).toHaveLength(2);
    });

    it("should handle empty calendar", () => {
      const emptyCalendar: ParticipantCalendar = {
        ...mockCalendar,
        events: [],
      };

      const result = CalendarProcessor.detectConflicts([emptyCalendar]);

      expect(result.hasConflicts).toBe(false);
      expect(result.conflicts).toHaveLength(0);
      expect(result.busyPeriods).toHaveLength(0);
    });

    it("should handle multiple participants", () => {
      const participant2Calendar: ParticipantCalendar = {
        participantId: "participant2",
        name: "Jane Doe",
        timezone: "UTC",
        events: [
          {
            id: "event4",
            summary: "Meeting 4",
            start: new Date("2024-01-15T09:00:00Z"),
            end: new Date("2024-01-15T10:00:00Z"),
            timezone: "UTC",
            status: "confirmed",
          },
        ],
        source: "ical",
      };

      const result = CalendarProcessor.detectConflicts([
        mockCalendar,
        participant2Calendar,
      ]);

      expect(result.busyPeriods).toHaveLength(3); // 2 from participant1, 1 from participant2
      expect(
        result.busyPeriods.some((p) => p.participantId === "participant1")
      ).toBe(true);
      expect(
        result.busyPeriods.some((p) => p.participantId === "participant2")
      ).toBe(true);
    });

    it("should handle adjacent events correctly", () => {
      const adjacentEvent1: CalendarEvent = {
        id: "adjacent1",
        summary: "Meeting 1",
        start: new Date("2024-01-15T10:00:00Z"),
        end: new Date("2024-01-15T11:00:00Z"),
        timezone: "UTC",
        status: "confirmed",
      };

      const adjacentEvent2: CalendarEvent = {
        id: "adjacent2",
        summary: "Meeting 2",
        start: new Date("2024-01-15T11:00:00Z"), // Starts exactly when first ends
        end: new Date("2024-01-15T12:00:00Z"),
        timezone: "UTC",
        status: "confirmed",
      };

      const calendarWithAdjacentEvents: ParticipantCalendar = {
        ...mockCalendar,
        events: [adjacentEvent1, adjacentEvent2],
      };

      const result = CalendarProcessor.detectConflicts([
        calendarWithAdjacentEvents,
      ]);

      // Adjacent events should not be considered conflicts
      expect(result.hasConflicts).toBe(false);
      expect(result.conflicts).toHaveLength(0);

      // But should create a single merged busy period
      expect(result.busyPeriods).toHaveLength(1);
      expect(result.busyPeriods[0].eventIds).toEqual([
        "adjacent1",
        "adjacent2",
      ]);
    });
  });

  describe("findFreeTimeSlots", () => {
    it("should find free time slots between busy periods", () => {
      const dateRange = {
        start: new Date("2024-01-15T08:00:00Z"),
        end: new Date("2024-01-15T16:00:00Z"),
      };

      const freeSlots = CalendarProcessor.findFreeTimeSlots(
        [mockCalendar],
        dateRange,
        60 // 1 hour duration
      );

      expect(freeSlots.length).toBeGreaterThan(0);

      // Should have free slots before first meeting (8:00-10:00)
      const morningSlots = freeSlots.filter((slot) => slot < mockEvent1.start);
      expect(morningSlots.length).toBeGreaterThan(0);

      // Should have free slots between meetings (after 11:30, before 14:00)
      const afternoonSlots = freeSlots.filter(
        (slot) => slot > mockEvent2.end && slot < mockEvent3.start
      );
      expect(afternoonSlots.length).toBeGreaterThan(0);
    });

    it("should respect meeting duration when finding slots", () => {
      const dateRange = {
        start: new Date("2024-01-15T08:00:00Z"),
        end: new Date("2024-01-15T16:00:00Z"),
      };

      const shortSlots = CalendarProcessor.findFreeTimeSlots(
        [mockCalendar],
        dateRange,
        30 // 30 minutes
      );

      const longSlots = CalendarProcessor.findFreeTimeSlots(
        [mockCalendar],
        dateRange,
        120 // 2 hours
      );

      // Should find more slots for shorter duration
      expect(shortSlots.length).toBeGreaterThan(longSlots.length);
    });

    it("should handle calendar with no events", () => {
      const emptyCalendar: ParticipantCalendar = {
        ...mockCalendar,
        events: [],
      };

      const dateRange = {
        start: new Date("2024-01-15T08:00:00Z"),
        end: new Date("2024-01-15T16:00:00Z"),
      };

      const freeSlots = CalendarProcessor.findFreeTimeSlots(
        [emptyCalendar],
        dateRange,
        60
      );

      // Should find many free slots throughout the day
      expect(freeSlots.length).toBeGreaterThan(20); // 8 hours / 15 min intervals
    });

    it("should find no free slots when completely busy", () => {
      const busyCalendar: ParticipantCalendar = {
        ...mockCalendar,
        events: [
          {
            id: "all-day",
            summary: "All Day Event",
            start: new Date("2024-01-15T08:00:00Z"),
            end: new Date("2024-01-15T16:00:00Z"),
            timezone: "UTC",
            status: "confirmed",
          },
        ],
      };

      const dateRange = {
        start: new Date("2024-01-15T08:00:00Z"),
        end: new Date("2024-01-15T16:00:00Z"),
      };

      const freeSlots = CalendarProcessor.findFreeTimeSlots(
        [busyCalendar],
        dateRange,
        60
      );

      expect(freeSlots).toHaveLength(0);
    });
  });

  describe("error handling", () => {
    it("should provide detailed error information", () => {
      try {
        CalendarProcessor.normalizeCalendarData(
          "invalid-data",
          "unsupported" as any,
          "User"
        );
      } catch (error) {
        expect(error).toBeInstanceOf(CalendarProcessingError);
        expect((error as CalendarProcessingError).message).toContain(
          "Unsupported calendar source"
        );
      }
    });

    it("should handle events with missing required fields", () => {
      const mockGoogleData = {
        items: [
          {
            // Missing id
            summary: "Invalid Event",
            start: { dateTime: "2024-01-15T10:00:00Z", timeZone: "UTC" },
            end: { dateTime: "2024-01-15T11:00:00Z", timeZone: "UTC" },
          },
          {
            id: "valid-event",
            summary: "Valid Event",
            start: { dateTime: "2024-01-15T12:00:00Z", timeZone: "UTC" },
            end: { dateTime: "2024-01-15T13:00:00Z", timeZone: "UTC" },
          },
        ],
        timeZone: "UTC",
      };

      const result = CalendarProcessor.normalizeCalendarData(
        mockGoogleData,
        "google",
        "Jane Doe"
      );

      // Should only include the valid event
      expect(result.calendar.events).toHaveLength(1);
      expect(result.calendar.events[0].id).toBe("valid-event");
    });

    it("should handle events with invalid date ranges", () => {
      const mockGoogleData = {
        items: [
          {
            id: "invalid-range",
            summary: "Invalid Range Event",
            start: { dateTime: "2024-01-15T11:00:00Z", timeZone: "UTC" },
            end: { dateTime: "2024-01-15T10:00:00Z", timeZone: "UTC" }, // End before start
          },
          {
            id: "valid-event",
            summary: "Valid Event",
            start: { dateTime: "2024-01-15T12:00:00Z", timeZone: "UTC" },
            end: { dateTime: "2024-01-15T13:00:00Z", timeZone: "UTC" },
          },
        ],
        timeZone: "UTC",
      };

      const result = CalendarProcessor.normalizeCalendarData(
        mockGoogleData,
        "google",
        "Jane Doe"
      );

      // Should only include the valid event
      expect(result.calendar.events).toHaveLength(1);
      expect(result.calendar.events[0].id).toBe("valid-event");
      expect(result.errors).toContain(
        "Event has invalid date range: Invalid Range Event (invalid-range)"
      );
    });
  });
});
