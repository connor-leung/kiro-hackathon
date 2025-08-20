import {
  CalendarEvent,
  ParticipantCalendar,
  DateRange,
} from "@/types/calendar";
import { ICalParser, ICalParseError, ICalValidationError } from "./ical-parser";
import { RecurrenceExpander } from "./recurrence-expander";
import { TimezoneUtils } from "./timezone-utils";

/**
 * Calendar processing errors
 */
export class CalendarProcessingError extends Error {
  constructor(
    message: string,
    public participantId?: string,
    public source?: string
  ) {
    super(message);
    this.name = "CalendarProcessingError";
  }
}

/**
 * Conflict detection result
 */
export interface ConflictDetectionResult {
  hasConflicts: boolean;
  conflicts: EventConflict[];
  busyPeriods: BusyPeriod[];
}

/**
 * Event conflict information
 */
export interface EventConflict {
  participantId: string;
  event1: CalendarEvent;
  event2: CalendarEvent;
  overlapStart: Date;
  overlapEnd: Date;
  overlapDuration: number; // minutes
}

/**
 * Busy period for a participant
 */
export interface BusyPeriod {
  participantId: string;
  start: Date;
  end: Date;
  eventIds: string[];
}

/**
 * Normalization result with validation info
 */
export interface NormalizationResult {
  calendar: ParticipantCalendar;
  warnings: string[];
  errors: string[];
}

/**
 * Calendar data processing engine
 */
export class CalendarProcessor {
  /**
   * Normalize calendar data from different sources into a consistent format
   */
  static normalizeCalendarData(
    rawData: any,
    source: "ical" | "google" | "outlook" | "apple",
    participantName?: string
  ): NormalizationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      let calendar: ParticipantCalendar;

      switch (source) {
        case "ical":
          calendar = this.normalizeICalData(rawData, participantName);
          break;
        case "google":
          calendar = this.normalizeGoogleCalendarData(rawData, participantName);
          break;
        case "outlook":
          calendar = this.normalizeOutlookCalendarData(
            rawData,
            participantName
          );
          break;
        case "apple":
          // Apple Calendar typically exports as iCal
          calendar = this.normalizeICalData(rawData, participantName);
          break;
        default:
          throw new CalendarProcessingError(
            `Unsupported calendar source: ${source}`
          );
      }

      // Validate and clean up events
      const { cleanedEvents, validationWarnings, validationErrors } =
        this.validateAndCleanEvents(calendar.events, calendar.participantId);

      calendar.events = cleanedEvents;
      warnings.push(...validationWarnings);
      errors.push(...validationErrors);

      // Normalize timezones
      calendar = this.normalizeTimezones(calendar);

      return {
        calendar,
        warnings,
        errors,
      };
    } catch (error) {
      if (error instanceof CalendarProcessingError) {
        throw error;
      }

      throw new CalendarProcessingError(
        `Failed to normalize calendar data: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        undefined,
        source
      );
    }
  }

  /**
   * Normalize iCal data
   */
  private static normalizeICalData(
    icalContent: string,
    participantName?: string
  ): ParticipantCalendar {
    try {
      return ICalParser.parseICalContent(icalContent, participantName);
    } catch (error) {
      if (
        error instanceof ICalParseError ||
        error instanceof ICalValidationError
      ) {
        throw new CalendarProcessingError(
          `iCal parsing failed: ${error.message}`,
          undefined,
          "ical"
        );
      }
      throw error;
    }
  }

  /**
   * Normalize Google Calendar data
   */
  private static normalizeGoogleCalendarData(
    googleData: any,
    participantName?: string
  ): ParticipantCalendar {
    if (!googleData || !Array.isArray(googleData.items)) {
      throw new CalendarProcessingError(
        "Invalid Google Calendar data format",
        undefined,
        "google"
      );
    }

    const events: CalendarEvent[] = [];

    for (const item of googleData.items) {
      try {
        const event = this.convertGoogleEvent(item);
        if (event) {
          events.push(event);
        }
      } catch (error) {
        console.warn(`Failed to convert Google event: ${error}`);
      }
    }

    return {
      participantId: this.generateParticipantId(participantName),
      name: participantName || "Google Calendar User",
      timezone: googleData.timeZone || "UTC",
      events,
      source: "google",
    };
  }

  /**
   * Normalize Outlook Calendar data
   */
  private static normalizeOutlookCalendarData(
    outlookData: any,
    participantName?: string
  ): ParticipantCalendar {
    if (!outlookData || !Array.isArray(outlookData.value)) {
      throw new CalendarProcessingError(
        "Invalid Outlook Calendar data format",
        undefined,
        "outlook"
      );
    }

    const events: CalendarEvent[] = [];

    for (const item of outlookData.value) {
      try {
        const event = this.convertOutlookEvent(item);
        if (event) {
          events.push(event);
        }
      } catch (error) {
        console.warn(`Failed to convert Outlook event: ${error}`);
      }
    }

    return {
      participantId: this.generateParticipantId(participantName),
      name: participantName || "Outlook Calendar User",
      timezone: "UTC", // Outlook events typically come in UTC
      events,
      source: "outlook",
    };
  }

  /**
   * Convert Google Calendar event to CalendarEvent
   */
  private static convertGoogleEvent(googleEvent: any): CalendarEvent | null {
    if (!googleEvent.id || !googleEvent.start) {
      return null;
    }

    // Handle all-day events
    const startDate = googleEvent.start.dateTime
      ? new Date(googleEvent.start.dateTime)
      : new Date(googleEvent.start.date);

    const endDate = googleEvent.end?.dateTime
      ? new Date(googleEvent.end.dateTime)
      : googleEvent.end?.date
      ? new Date(googleEvent.end.date)
      : new Date(startDate.getTime() + 60 * 60 * 1000); // Default 1 hour

    return {
      id: googleEvent.id,
      summary: googleEvent.summary || "Untitled Event",
      start: startDate,
      end: endDate,
      timezone: googleEvent.start.timeZone || "UTC",
      status: this.mapGoogleStatus(googleEvent.status),
      // Google Calendar recurrence is handled differently - would need expansion
    };
  }

  /**
   * Convert Outlook Calendar event to CalendarEvent
   */
  private static convertOutlookEvent(outlookEvent: any): CalendarEvent | null {
    if (!outlookEvent.id || !outlookEvent.start) {
      return null;
    }

    return {
      id: outlookEvent.id,
      summary: outlookEvent.subject || "Untitled Event",
      start: new Date(outlookEvent.start.dateTime),
      end: new Date(outlookEvent.end.dateTime),
      timezone: outlookEvent.start.timeZone || "UTC",
      status: this.mapOutlookStatus(outlookEvent.showAs),
    };
  }

  /**
   * Map Google Calendar status to our format
   */
  private static mapGoogleStatus(
    status?: string
  ): "confirmed" | "tentative" | "cancelled" {
    switch (status) {
      case "tentative":
        return "tentative";
      case "cancelled":
        return "cancelled";
      default:
        return "confirmed";
    }
  }

  /**
   * Map Outlook status to our format
   */
  private static mapOutlookStatus(
    showAs?: string
  ): "confirmed" | "tentative" | "cancelled" {
    switch (showAs) {
      case "tentative":
        return "tentative";
      case "free":
        return "cancelled"; // Treat as cancelled since it's free time
      default:
        return "confirmed";
    }
  }

  /**
   * Validate and clean calendar events
   */
  private static validateAndCleanEvents(
    events: CalendarEvent[],
    participantId: string
  ): {
    cleanedEvents: CalendarEvent[];
    validationWarnings: string[];
    validationErrors: string[];
  } {
    const cleanedEvents: CalendarEvent[] = [];
    const validationWarnings: string[] = [];
    const validationErrors: string[] = [];

    for (const event of events) {
      try {
        // Skip cancelled events
        if (event.status === "cancelled") {
          validationWarnings.push(
            `Skipping cancelled event: ${event.summary} (${event.id})`
          );
          continue;
        }

        // Validate required fields
        if (!event.id || !event.start || !event.end) {
          validationErrors.push(
            `Event missing required fields: ${event.summary || "Unknown"}`
          );
          continue;
        }

        // Validate date order
        if (event.start >= event.end) {
          validationErrors.push(
            `Event has invalid date range: ${event.summary} (${event.id})`
          );
          continue;
        }

        // Validate reasonable duration (not more than 7 days)
        const durationMs = event.end.getTime() - event.start.getTime();
        const maxDurationMs = 7 * 24 * 60 * 60 * 1000; // 7 days
        if (durationMs > maxDurationMs) {
          validationWarnings.push(
            `Event has unusually long duration: ${event.summary} (${event.id})`
          );
        }

        // Clean up the event
        const cleanedEvent: CalendarEvent = {
          ...event,
          summary: event.summary.trim() || "Untitled Event",
          timezone: event.timezone || "UTC",
        };

        cleanedEvents.push(cleanedEvent);
      } catch (error) {
        validationErrors.push(
          `Failed to validate event ${event.id}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    return {
      cleanedEvents,
      validationWarnings,
      validationErrors,
    };
  }

  /**
   * Normalize timezones across all events in a calendar
   */
  private static normalizeTimezones(
    calendar: ParticipantCalendar
  ): ParticipantCalendar {
    const normalizedEvents = calendar.events.map((event) => {
      try {
        // Convert to UTC for internal processing
        const utcStart = TimezoneUtils.toUTC(event.start, event.timezone);
        const utcEnd = TimezoneUtils.toUTC(event.end, event.timezone);

        return {
          ...event,
          start: utcStart,
          end: utcEnd,
          timezone: "UTC", // All internal processing in UTC
        };
      } catch (error) {
        console.warn(
          `Failed to normalize timezone for event ${event.id}: ${error}`
        );
        return event; // Return original if conversion fails
      }
    });

    return {
      ...calendar,
      events: normalizedEvents,
    };
  }

  /**
   * Detect conflicts between events within calendars and across participants
   */
  static detectConflicts(
    calendars: ParticipantCalendar[],
    dateRange?: DateRange
  ): ConflictDetectionResult {
    const conflicts: EventConflict[] = [];
    const busyPeriods: BusyPeriod[] = [];

    // Expand recurring events first
    const expandedCalendars = calendars.map((calendar) =>
      this.expandRecurringEvents(calendar, dateRange)
    );

    // Detect conflicts within each participant's calendar
    for (const calendar of expandedCalendars) {
      const participantConflicts = this.detectParticipantConflicts(calendar);
      conflicts.push(...participantConflicts);

      // Generate busy periods for this participant
      const participantBusyPeriods = this.generateBusyPeriods(calendar);
      busyPeriods.push(...participantBusyPeriods);
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      busyPeriods,
    };
  }

  /**
   * Expand recurring events within a date range
   */
  private static expandRecurringEvents(
    calendar: ParticipantCalendar,
    dateRange?: DateRange
  ): ParticipantCalendar {
    const expandedEvents: CalendarEvent[] = [];

    for (const event of calendar.events) {
      if (event.recurrence) {
        try {
          const occurrences = RecurrenceExpander.expandSingleEvent(
            event,
            dateRange || {
              start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
              end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year ahead
            }
          );
          expandedEvents.push(...occurrences);
        } catch (error) {
          console.warn(
            `Failed to expand recurring event ${event.id}: ${error}`
          );
          // Add the original event if expansion fails
          expandedEvents.push(event);
        }
      } else {
        expandedEvents.push(event);
      }
    }

    return {
      ...calendar,
      events: expandedEvents,
    };
  }

  /**
   * Detect conflicts within a single participant's calendar
   */
  private static detectParticipantConflicts(
    calendar: ParticipantCalendar
  ): EventConflict[] {
    const conflicts: EventConflict[] = [];
    const events = calendar.events.sort(
      (a, b) => a.start.getTime() - b.start.getTime()
    );

    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const event1 = events[i];
        const event2 = events[j];

        // Skip if second event starts after first event ends
        if (event2.start >= event1.end) {
          break; // Events are sorted, so no more conflicts for event1
        }

        // Check for overlap
        const overlapStart = new Date(
          Math.max(event1.start.getTime(), event2.start.getTime())
        );
        const overlapEnd = new Date(
          Math.min(event1.end.getTime(), event2.end.getTime())
        );

        if (overlapStart < overlapEnd) {
          const overlapDuration =
            (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60);

          conflicts.push({
            participantId: calendar.participantId,
            event1,
            event2,
            overlapStart,
            overlapEnd,
            overlapDuration,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Generate busy periods for a participant
   */
  private static generateBusyPeriods(
    calendar: ParticipantCalendar
  ): BusyPeriod[] {
    const busyPeriods: BusyPeriod[] = [];
    const events = calendar.events
      .filter((event) => event.status !== "cancelled")
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    if (events.length === 0) {
      return busyPeriods;
    }

    let currentPeriod: BusyPeriod = {
      participantId: calendar.participantId,
      start: events[0].start,
      end: events[0].end,
      eventIds: [events[0].id],
    };

    for (let i = 1; i < events.length; i++) {
      const event = events[i];

      // If this event overlaps or is adjacent to the current period, extend it
      if (event.start <= currentPeriod.end) {
        currentPeriod.end = new Date(
          Math.max(currentPeriod.end.getTime(), event.end.getTime())
        );
        currentPeriod.eventIds.push(event.id);
      } else {
        // Start a new busy period
        busyPeriods.push(currentPeriod);
        currentPeriod = {
          participantId: calendar.participantId,
          start: event.start,
          end: event.end,
          eventIds: [event.id],
        };
      }
    }

    // Add the last period
    busyPeriods.push(currentPeriod);

    return busyPeriods;
  }

  /**
   * Find free time slots across all participants
   */
  static findFreeTimeSlots(
    calendars: ParticipantCalendar[],
    dateRange: DateRange,
    durationMinutes: number = 60
  ): Date[] {
    const freeSlots: Date[] = [];
    const conflictResult = this.detectConflicts(calendars, dateRange);

    // Get all busy periods across all participants
    const allBusyPeriods = conflictResult.busyPeriods.sort(
      (a, b) => a.start.getTime() - b.start.getTime()
    );

    // Find gaps between busy periods
    let currentTime = new Date(dateRange.start);
    const endTime = new Date(dateRange.end);
    const durationMs = durationMinutes * 60 * 1000;

    for (const busyPeriod of allBusyPeriods) {
      // Check if there's a gap before this busy period
      while (currentTime.getTime() + durationMs <= busyPeriod.start.getTime()) {
        if (
          currentTime >= dateRange.start &&
          currentTime.getTime() + durationMs <= endTime.getTime()
        ) {
          freeSlots.push(new Date(currentTime));
        }
        currentTime = new Date(currentTime.getTime() + 15 * 60 * 1000); // Check every 15 minutes
      }

      // Move current time to after this busy period
      currentTime = new Date(
        Math.max(currentTime.getTime(), busyPeriod.end.getTime())
      );
    }

    // Check for remaining time after the last busy period
    while (currentTime.getTime() + durationMs <= endTime.getTime()) {
      freeSlots.push(new Date(currentTime));
      currentTime = new Date(currentTime.getTime() + 15 * 60 * 1000);
    }

    return freeSlots;
  }

  /**
   * Generate participant ID from name
   */
  private static generateParticipantId(name?: string): string {
    if (name) {
      return name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
    }
    return `participant-${Math.random().toString(36).substring(2, 9)}`;
  }
}
