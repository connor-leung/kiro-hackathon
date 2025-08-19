import { describe, it, expect } from "vitest";
import {
  ICalParser,
  ICalParseError,
  ICalValidationError,
} from "../ical-parser";

describe("ICalParser", () => {
  describe("parseICalContent", () => {
    it("should parse a basic iCal file", () => {
      const icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event-1
DTSTART:20231201T120000Z
DTEND:20231201T130000Z
SUMMARY:Test Meeting
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

      const result = ICalParser.parseICalContent(icalContent, "John Doe");

      expect(result.participantId).toBe("john-doe");
      expect(result.name).toBe("John Doe");
      expect(result.source).toBe("ical");
      expect(result.events).toHaveLength(1);

      const event = result.events[0];
      expect(event.id).toBe("test-event-1");
      expect(event.summary).toBe("Test Meeting");
      expect(event.status).toBe("confirmed");
      expect(event.start).toEqual(new Date("2023-12-01T12:00:00.000Z"));
      expect(event.end).toEqual(new Date("2023-12-01T13:00:00.000Z"));
    });

    it("should handle events without DTEND using default duration", () => {
      const icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event-1
DTSTART:20231201T120000Z
SUMMARY:Test Meeting
END:VEVENT
END:VCALENDAR`;

      const result = ICalParser.parseICalContent(icalContent);
      const event = result.events[0];

      expect(event.start).toEqual(new Date("2023-12-01T12:00:00.000Z"));
      expect(event.end).toEqual(new Date("2023-12-01T13:00:00.000Z")); // 1 hour default
    });

    it("should handle events with DURATION", () => {
      const icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event-1
DTSTART:20231201T120000Z
DURATION:PT2H30M
SUMMARY:Long Meeting
END:VEVENT
END:VCALENDAR`;

      const result = ICalParser.parseICalContent(icalContent);
      const event = result.events[0];

      expect(event.start).toEqual(new Date("2023-12-01T12:00:00.000Z"));
      expect(event.end).toEqual(new Date("2023-12-01T14:30:00.000Z")); // 2.5 hours later
    });

    it("should parse recurring events with RRULE", () => {
      const icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:recurring-event-1
DTSTART:20231201T120000Z
DTEND:20231201T130000Z
SUMMARY:Weekly Meeting
RRULE:FREQ=WEEKLY;COUNT=5
END:VEVENT
END:VCALENDAR`;

      const result = ICalParser.parseICalContent(icalContent);
      const event = result.events[0];

      expect(event.recurrence).toBeDefined();
      expect(event.recurrence?.options.freq).toBe(2); // RRule.WEEKLY
      expect(event.recurrence?.options.count).toBe(5);
    });

    it("should handle folded lines correctly", () => {
      const icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event-1
DTSTART:20231201T120000Z
DTEND:20231201T130000Z
SUMMARY:This is a very long summary that spans multiple lines and should
  be properly unfolded by the parser
DESCRIPTION:This is also a long description that has been folded across
  multiple lines in the iCal format and needs to be handled correctly
END:VEVENT
END:VCALENDAR`;

      const result = ICalParser.parseICalContent(icalContent);
      const event = result.events[0];

      expect(event.summary).toBe(
        "This is a very long summary that spans multiple lines and should be properly unfolded by the parser"
      );
    });

    it("should handle different date formats", () => {
      const icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event-1
DTSTART:20231201T120000
DTEND:20231201T130000
SUMMARY:Local Time Event
END:VEVENT
BEGIN:VEVENT
UID:test-event-2
DTSTART:20231201T120000Z
DTEND:20231201T130000Z
SUMMARY:UTC Event
END:VEVENT
END:VCALENDAR`;

      const result = ICalParser.parseICalContent(icalContent);

      expect(result.events).toHaveLength(2);
      expect(result.events[0].summary).toBe("Local Time Event");
      expect(result.events[1].summary).toBe("UTC Event");
    });

    it("should handle different event statuses", () => {
      const icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event-1
DTSTART:20231201T120000Z
DTEND:20231201T130000Z
SUMMARY:Confirmed Event
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
UID:test-event-2
DTSTART:20231201T140000Z
DTEND:20231201T150000Z
SUMMARY:Tentative Event
STATUS:TENTATIVE
END:VEVENT
BEGIN:VEVENT
UID:test-event-3
DTSTART:20231201T160000Z
DTEND:20231201T170000Z
SUMMARY:Cancelled Event
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR`;

      const result = ICalParser.parseICalContent(icalContent);

      expect(result.events).toHaveLength(3);
      expect(result.events[0].status).toBe("confirmed");
      expect(result.events[1].status).toBe("tentative");
      expect(result.events[2].status).toBe("cancelled");
    });

    it("should generate participant ID from name", () => {
      const result1 = ICalParser.parseICalContent(
        "BEGIN:VCALENDAR\nEND:VCALENDAR",
        "John Doe"
      );
      const result2 = ICalParser.parseICalContent(
        "BEGIN:VCALENDAR\nEND:VCALENDAR",
        "Jane Smith-Wilson"
      );

      expect(result1.participantId).toBe("john-doe");
      expect(result2.participantId).toBe("jane-smith-wilson");
    });

    it("should generate random participant ID when no name provided", () => {
      const result = ICalParser.parseICalContent(
        "BEGIN:VCALENDAR\nEND:VCALENDAR"
      );

      expect(result.participantId).toMatch(/^participant-[a-z0-9]{7}$/);
      expect(result.name).toBe("Unknown Participant");
    });

    it("should throw error for invalid iCal content", () => {
      expect(() => {
        ICalParser.parseICalContent("Invalid content");
      }).toThrow(ICalParseError);
    });

    it("should handle empty calendar", () => {
      const icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
END:VCALENDAR`;

      const result = ICalParser.parseICalContent(icalContent);
      expect(result.events).toHaveLength(0);
    });
  });

  describe("validateICalContent", () => {
    it("should validate correct iCal content", () => {
      const icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event-1
DTSTART:20231201T120000Z
DTEND:20231201T130000Z
SUMMARY:Test Meeting
END:VEVENT
END:VCALENDAR`;

      const result = ICalParser.validateICalContent(icalContent);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect missing BEGIN:VCALENDAR", () => {
      const icalContent = `VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event-1
DTSTART:20231201T120000Z
END:VEVENT
END:VCALENDAR`;

      const result = ICalParser.validateICalContent(icalContent);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Missing required BEGIN:VCALENDAR");
    });

    it("should detect missing END:VCALENDAR", () => {
      const icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event-1
DTSTART:20231201T120000Z
END:VEVENT`;

      const result = ICalParser.validateICalContent(icalContent);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Missing required END:VCALENDAR");
    });

    it("should detect missing VEVENT components", () => {
      const icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
END:VCALENDAR`;

      const result = ICalParser.validateICalContent(icalContent);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("No VEVENT components found");
    });

    it("should detect missing required event properties", () => {
      const icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
SUMMARY:Test Meeting
END:VEVENT
END:VCALENDAR`;

      const result = ICalParser.validateICalContent(icalContent);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("Missing required UID"))
      ).toBe(true);
      expect(
        result.errors.some((e) => e.includes("Missing required DTSTART"))
      ).toBe(true);
    });

    it("should detect invalid date formats", () => {
      const icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event-1
DTSTART:invalid-date
DTEND:20231201T130000Z
SUMMARY:Test Meeting
END:VEVENT
END:VCALENDAR`;

      const result = ICalParser.validateICalContent(icalContent);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("Invalid DTSTART format"))
      ).toBe(true);
    });

    it("should handle multiple validation errors", () => {
      const icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
SUMMARY:Test Meeting
END:VEVENT
BEGIN:VEVENT
UID:test-event-2
DTSTART:invalid-date
SUMMARY:Another Meeting
END:VEVENT
END:VCALENDAR`;

      const result = ICalParser.validateICalContent(icalContent);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(2);
    });
  });

  describe("edge cases", () => {
    it("should handle malformed RRULE gracefully", () => {
      const icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event-1
DTSTART:20231201T120000Z
DTEND:20231201T130000Z
SUMMARY:Test Meeting
RRULE:INVALID_RULE
END:VEVENT
END:VCALENDAR`;

      const result = ICalParser.parseICalContent(icalContent);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].recurrence).toBeUndefined();
    });

    it("should handle events with missing summary", () => {
      const icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event-1
DTSTART:20231201T120000Z
DTEND:20231201T130000Z
END:VEVENT
END:VCALENDAR`;

      const result = ICalParser.parseICalContent(icalContent);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].summary).toBe("Untitled Event");
    });

    it("should handle timezone information", () => {
      const icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VTIMEZONE
TZID:America/New_York
END:VTIMEZONE
BEGIN:VEVENT
UID:test-event-1
DTSTART;TZID=America/New_York:20231201T120000
DTEND;TZID=America/New_York:20231201T130000
SUMMARY:Test Meeting
END:VEVENT
END:VCALENDAR`;

      const result = ICalParser.parseICalContent(icalContent);

      expect(result.timezone).toBe("America/New_York");
      expect(result.events).toHaveLength(1);
    });

    it("should handle very large iCal files", () => {
      let icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
`;

      // Add 100 events
      for (let i = 1; i <= 100; i++) {
        icalContent += `BEGIN:VEVENT
UID:test-event-${i}
DTSTART:20231201T${String(12 + (i % 12)).padStart(2, "0")}0000Z
DTEND:20231201T${String(13 + (i % 12)).padStart(2, "0")}0000Z
SUMMARY:Test Meeting ${i}
END:VEVENT
`;
      }

      icalContent += "END:VCALENDAR";

      const result = ICalParser.parseICalContent(icalContent);

      expect(result.events).toHaveLength(100);
    });
  });
});
