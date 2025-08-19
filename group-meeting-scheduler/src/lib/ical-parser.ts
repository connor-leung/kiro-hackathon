import { RRule } from "rrule";
import { parseISO, isValid, format } from "date-fns";
import { CalendarEvent, ParticipantCalendar } from "@/types/calendar";

/**
 * iCal parsing errors
 */
export class ICalParseError extends Error {
  constructor(message: string, public line?: number, public property?: string) {
    super(message);
    this.name = "ICalParseError";
  }
}

/**
 * iCal validation errors
 */
export class ICalValidationError extends Error {
  constructor(message: string, public errors: string[]) {
    super(message);
    this.name = "ICalValidationError";
  }
}

/**
 * Raw iCal event data before processing
 */
interface RawICalEvent {
  uid?: string;
  summary?: string;
  dtstart?: string;
  dtend?: string;
  dtstart_tz?: string;
  dtend_tz?: string;
  status?: string;
  rrule?: string;
  exdate?: string[];
  description?: string;
  location?: string;
}

/**
 * Parsed iCal component
 */
interface ICalComponent {
  type: string;
  properties: Record<string, string | string[]>;
}

/**
 * iCal parser utility class
 */
export class ICalParser {
  /**
   * Parse iCal content and extract calendar events
   */
  static parseICalContent(
    content: string,
    participantName?: string
  ): ParticipantCalendar {
    try {
      // Basic validation first
      if (!content.includes("BEGIN:VCALENDAR")) {
        throw new ICalParseError(
          "Invalid iCal content: Missing BEGIN:VCALENDAR"
        );
      }

      const lines = this.preprocessICalContent(content);
      const components = this.parseComponents(lines);
      const events = this.extractEvents(components);

      return {
        participantId: this.generateParticipantId(participantName),
        name: participantName || "Unknown Participant",
        timezone: this.extractTimezone(components) || "UTC",
        events,
        source: "ical",
      };
    } catch (error) {
      if (
        error instanceof ICalParseError ||
        error instanceof ICalValidationError
      ) {
        throw error;
      }
      throw new ICalParseError(
        `Failed to parse iCal content: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Validate iCal file format and required fields
   */
  static validateICalContent(content: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    try {
      // Check basic iCal structure
      if (!content.includes("BEGIN:VCALENDAR")) {
        errors.push("Missing required BEGIN:VCALENDAR");
      }

      if (!content.includes("END:VCALENDAR")) {
        errors.push("Missing required END:VCALENDAR");
      }

      // Check for at least one event
      if (!content.includes("BEGIN:VEVENT")) {
        errors.push("No VEVENT components found");
      }

      // Validate line endings and format
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (
          line.length > 75 &&
          !line.startsWith(" ") &&
          !line.startsWith("\t")
        ) {
          // Check if this is a continuation line issue
          if (i > 0 && !lines[i - 1].endsWith("\\")) {
            errors.push(
              `Line ${i + 1} exceeds 75 characters without proper folding`
            );
          }
        }
      }

      // Try to parse components to catch structural issues
      const processedLines = this.preprocessICalContent(content);
      const components = this.parseComponents(processedLines);

      // Validate each VEVENT component
      const vevents = components.filter((c) => c.type === "VEVENT");
      vevents.forEach((event, index) => {
        const eventErrors = this.validateEvent(event, index);
        errors.push(...eventErrors);
      });
    } catch (error) {
      errors.push(
        `Parsing error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Preprocess iCal content by unfolding lines and normalizing
   */
  private static preprocessICalContent(content: string): string[] {
    const lines = content.split(/\r?\n/);
    const unfolded: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Skip empty lines
      if (!line.trim()) continue;

      // Unfold continuation lines (lines starting with space or tab)
      while (
        i + 1 < lines.length &&
        (lines[i + 1].startsWith(" ") || lines[i + 1].startsWith("\t"))
      ) {
        i++;
        line += lines[i].substring(1); // Remove the leading space/tab
      }

      unfolded.push(line.trim());
    }

    return unfolded;
  }

  /**
   * Parse iCal components from preprocessed lines
   */
  private static parseComponents(lines: string[]): ICalComponent[] {
    const components: ICalComponent[] = [];
    let currentComponent: ICalComponent | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith("BEGIN:")) {
        const type = line.substring(6);
        currentComponent = {
          type,
          properties: {},
        };
      } else if (line.startsWith("END:")) {
        if (currentComponent) {
          components.push(currentComponent);
          currentComponent = null;
        }
      } else if (currentComponent && line.includes(":")) {
        const colonIndex = line.indexOf(":");
        const propertyPart = line.substring(0, colonIndex);
        const value = line.substring(colonIndex + 1);

        // Parse property name and parameters
        const [propertyName] = propertyPart.split(";");

        // Store the full property line for properties that might have parameters
        const fullPropertyValue = propertyPart.includes(";")
          ? `${propertyPart}:${value}`
          : value;

        if (currentComponent.properties[propertyName]) {
          // Handle multiple values (like EXDATE)
          const existing = currentComponent.properties[propertyName];
          if (Array.isArray(existing)) {
            existing.push(fullPropertyValue);
          } else {
            currentComponent.properties[propertyName] = [
              existing,
              fullPropertyValue,
            ];
          }
        } else {
          currentComponent.properties[propertyName] = fullPropertyValue;
        }
      }
    }

    return components;
  }

  /**
   * Extract and process calendar events from components
   */
  private static extractEvents(components: ICalComponent[]): CalendarEvent[] {
    const vevents = components.filter((c) => c.type === "VEVENT");
    const events: CalendarEvent[] = [];

    for (const vevent of vevents) {
      try {
        const event = this.processEvent(vevent);
        if (event) {
          events.push(event);
        }
      } catch (error) {
        // Log error but continue processing other events
        console.warn(
          `Failed to process event: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    return events;
  }

  /**
   * Process a single VEVENT component into a CalendarEvent
   */
  private static processEvent(vevent: ICalComponent): CalendarEvent | null {
    const props = vevent.properties;

    // Required fields
    const uid = props.UID as string;
    const dtstart = props.DTSTART as string;

    if (!uid || !dtstart) {
      throw new ICalParseError("Event missing required UID or DTSTART");
    }

    // Parse dates
    const startDate = this.parseDateTime(dtstart);
    let endDate: Date;

    if (props.DTEND) {
      endDate = this.parseDateTime(props.DTEND as string);
    } else if (props.DURATION) {
      // Calculate end date from duration
      endDate = this.calculateEndFromDuration(
        startDate,
        props.DURATION as string
      );
    } else {
      // Default to 1 hour duration
      endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    }

    // Extract timezone
    const timezone = this.extractEventTimezone(dtstart) || "UTC";

    // Parse recurrence rule if present
    let recurrence: RRule | undefined;
    if (props.RRULE) {
      try {
        const rruleStr = props.RRULE as string;
        // Check if RRULE contains valid frequency
        if (rruleStr.includes("FREQ=")) {
          recurrence = this.parseRecurrenceRule(rruleStr, startDate);
        }
      } catch (error) {
        console.warn(
          `Failed to parse RRULE: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    return {
      id: uid,
      summary: (props.SUMMARY as string) || "Untitled Event",
      start: startDate,
      end: endDate,
      timezone,
      recurrence,
      status: this.parseStatus(props.STATUS as string),
    };
  }

  /**
   * Parse iCal date-time string
   */
  private static parseDateTime(dateTimeStr: string): Date {
    // Extract the actual date-time value from the full property
    let cleanDateTime = dateTimeStr;

    // If this is a full property with parameters, extract just the date-time value
    if (dateTimeStr.includes(":")) {
      const colonIndex = dateTimeStr.lastIndexOf(":");
      cleanDateTime = dateTimeStr.substring(colonIndex + 1);
    }

    // Handle timezone suffix (e.g., "20231201T120000Z" or "20231201T120000")
    if (cleanDateTime.endsWith("Z")) {
      cleanDateTime = cleanDateTime.slice(0, -1);
    }

    // Parse iCal format: YYYYMMDDTHHMMSS
    if (cleanDateTime.length === 15 && cleanDateTime.includes("T")) {
      const [datePart, timePart] = cleanDateTime.split("T");
      const year = parseInt(datePart.substring(0, 4));
      const month = parseInt(datePart.substring(4, 6)) - 1; // Month is 0-indexed
      const day = parseInt(datePart.substring(6, 8));
      const hour = parseInt(timePart.substring(0, 2));
      const minute = parseInt(timePart.substring(2, 4));
      const second = parseInt(timePart.substring(4, 6));

      const date = new Date(year, month, day, hour, minute, second);

      // If original string ended with Z, treat as UTC
      if (dateTimeStr.endsWith("Z")) {
        return new Date(date.getTime() - date.getTimezoneOffset() * 60000);
      }

      return date;
    }

    // Fallback to ISO parsing
    try {
      const isoDate = parseISO(cleanDateTime);
      if (isValid(isoDate)) {
        return isoDate;
      }
    } catch (error) {
      // Continue to error
    }

    throw new ICalParseError(`Invalid date format: ${dateTimeStr}`);
  }

  /**
   * Calculate end date from duration string
   */
  private static calculateEndFromDuration(
    startDate: Date,
    duration: string
  ): Date {
    // Parse ISO 8601 duration (e.g., "PT1H30M")
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) {
      throw new ICalParseError(`Invalid duration format: ${duration}`);
    }

    const hours = parseInt(match[1] || "0");
    const minutes = parseInt(match[2] || "0");
    const seconds = parseInt(match[3] || "0");

    const totalMs = (hours * 60 * 60 + minutes * 60 + seconds) * 1000;
    return new Date(startDate.getTime() + totalMs);
  }

  /**
   * Extract timezone from date-time string
   */
  private static extractEventTimezone(dateTimeStr: string): string | null {
    if (dateTimeStr.endsWith("Z")) {
      return "UTC";
    }

    // Look for timezone parameter (TZID) in the full property format
    const tzidMatch = dateTimeStr.match(/TZID=([^:;]+)/);
    if (tzidMatch) {
      return tzidMatch[1];
    }

    return null;
  }

  /**
   * Parse recurrence rule string into RRule object
   */
  private static parseRecurrenceRule(rruleStr: string, dtstart: Date): RRule {
    // Convert iCal RRULE to RRule options
    const options: any = { dtstart };

    const parts = rruleStr.split(";");
    for (const part of parts) {
      const [key, value] = part.split("=");

      switch (key) {
        case "FREQ":
          options.freq = this.mapFrequency(value);
          break;
        case "INTERVAL":
          options.interval = parseInt(value);
          break;
        case "COUNT":
          options.count = parseInt(value);
          break;
        case "UNTIL":
          options.until = this.parseDateTime(value);
          break;
        case "BYDAY":
          options.byweekday = this.parseByDay(value);
          break;
        case "BYMONTHDAY":
          options.bymonthday = value.split(",").map((v) => parseInt(v));
          break;
        case "BYMONTH":
          options.bymonth = value.split(",").map((v) => parseInt(v));
          break;
      }
    }

    return new RRule(options);
  }

  /**
   * Map iCal frequency to RRule frequency
   */
  private static mapFrequency(freq: string): number {
    const freqMap: Record<string, number> = {
      YEARLY: RRule.YEARLY,
      MONTHLY: RRule.MONTHLY,
      WEEKLY: RRule.WEEKLY,
      DAILY: RRule.DAILY,
      HOURLY: RRule.HOURLY,
      MINUTELY: RRule.MINUTELY,
      SECONDLY: RRule.SECONDLY,
    };

    return freqMap[freq] || RRule.WEEKLY;
  }

  /**
   * Parse BYDAY values for recurrence
   */
  private static parseByDay(byday: string): number[] {
    const dayMap: Record<string, number> = {
      SU: RRule.SU.weekday,
      MO: RRule.MO.weekday,
      TU: RRule.TU.weekday,
      WE: RRule.WE.weekday,
      TH: RRule.TH.weekday,
      FR: RRule.FR.weekday,
      SA: RRule.SA.weekday,
    };

    return byday.split(",").map((day) => {
      const cleanDay = day.replace(/^[-+]?\d*/, ""); // Remove numeric prefix
      return dayMap[cleanDay] || 0;
    });
  }

  /**
   * Parse event status
   */
  private static parseStatus(
    status?: string
  ): "confirmed" | "tentative" | "cancelled" {
    if (!status) return "confirmed";

    switch (status.toUpperCase()) {
      case "TENTATIVE":
        return "tentative";
      case "CANCELLED":
        return "cancelled";
      default:
        return "confirmed";
    }
  }

  /**
   * Extract calendar timezone from components
   */
  private static extractTimezone(components: ICalComponent[]): string | null {
    // First check for VTIMEZONE component
    const vtimezone = components.find((c) => c.type === "VTIMEZONE");
    if (vtimezone && vtimezone.properties.TZID) {
      return vtimezone.properties.TZID as string;
    }

    // Fallback: check if any events have timezone information
    const vevents = components.filter((c) => c.type === "VEVENT");
    for (const vevent of vevents) {
      if (vevent.properties.DTSTART) {
        const dtstart = vevent.properties.DTSTART as string;
        const tzid = this.extractEventTimezone(dtstart);
        if (tzid && tzid !== "UTC") {
          return tzid;
        }
      }
    }

    return null;
  }

  /**
   * Generate participant ID from name or create random one
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

  /**
   * Validate individual event component
   */
  private static validateEvent(event: ICalComponent, index: number): string[] {
    const errors: string[] = [];
    const props = event.properties;

    if (!props.UID) {
      errors.push(`Event ${index + 1}: Missing required UID property`);
    }

    if (!props.DTSTART) {
      errors.push(`Event ${index + 1}: Missing required DTSTART property`);
    } else {
      try {
        this.parseDateTime(props.DTSTART as string);
      } catch (error) {
        errors.push(`Event ${index + 1}: Invalid DTSTART format`);
      }
    }

    if (props.DTEND) {
      try {
        this.parseDateTime(props.DTEND as string);
      } catch (error) {
        errors.push(`Event ${index + 1}: Invalid DTEND format`);
      }
    }

    return errors;
  }
}
