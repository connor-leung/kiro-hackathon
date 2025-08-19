import { format, parseISO, isValid } from "date-fns";
import { CalendarEvent } from "@/types/calendar";

/**
 * Timezone conversion utilities
 */
export class TimezoneUtils {
  /**
   * Convert a date to UTC
   */
  static toUTC(date: Date, timezone?: string): Date {
    if (!timezone || timezone === "UTC") {
      return new Date(date);
    }

    try {
      // Use Intl.DateTimeFormat to handle timezone conversion
      const utcTime = new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(date);

      const localTime = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(date);

      // Calculate offset between local time and UTC
      const utcDate = this.partsToDate(utcTime);
      const localDate = this.partsToDate(localTime);
      const offset = utcDate.getTime() - localDate.getTime();

      return new Date(date.getTime() + offset);
    } catch (error) {
      console.warn(
        `Failed to convert timezone ${timezone}, using original date:`,
        error
      );
      return new Date(date);
    }
  }

  /**
   * Convert a UTC date to a specific timezone
   */
  static fromUTC(utcDate: Date, timezone: string): Date {
    if (timezone === "UTC") {
      return new Date(utcDate);
    }

    try {
      // Create a date in the target timezone
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

      const parts = formatter.formatToParts(utcDate);
      return this.partsToDate(parts);
    } catch (error) {
      console.warn(
        `Failed to convert from UTC to timezone ${timezone}:`,
        error
      );
      return new Date(utcDate);
    }
  }

  /**
   * Normalize all events in a calendar to UTC
   */
  static normalizeEventsToUTC(events: CalendarEvent[]): CalendarEvent[] {
    return events.map((event) => ({
      ...event,
      start: this.toUTC(event.start, event.timezone),
      end: this.toUTC(event.end, event.timezone),
      timezone: "UTC",
    }));
  }

  /**
   * Get the user's detected timezone
   */
  static getDetectedTimezone(): string {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (error) {
      return "UTC";
    }
  }

  /**
   * Validate if a timezone string is valid
   */
  static isValidTimezone(timezone: string): boolean {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Format a date in a specific timezone
   */
  static formatInTimezone(
    date: Date,
    timezone: string,
    formatStr: string = "yyyy-MM-dd HH:mm:ss"
  ): string {
    try {
      const localDate = this.fromUTC(date, timezone);
      return format(localDate, formatStr);
    } catch (error) {
      return format(date, formatStr);
    }
  }

  /**
   * Get timezone offset in minutes for a specific date and timezone
   */
  static getTimezoneOffset(date: Date, timezone: string): number {
    try {
      const utcDate = new Date(
        date.toLocaleString("en-US", { timeZone: "UTC" })
      );
      const tzDate = new Date(
        date.toLocaleString("en-US", { timeZone: timezone })
      );
      return (utcDate.getTime() - tzDate.getTime()) / (1000 * 60);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Convert DateTimeFormat parts to Date object
   */
  private static partsToDate(parts: Intl.DateTimeFormatPart[]): Date {
    const partsObj: Record<string, string> = {};
    parts.forEach((part) => {
      partsObj[part.type] = part.value;
    });

    const year = parseInt(partsObj.year);
    const month = parseInt(partsObj.month) - 1; // Month is 0-indexed
    const day = parseInt(partsObj.day);
    const hour = parseInt(partsObj.hour);
    const minute = parseInt(partsObj.minute);
    const second = parseInt(partsObj.second);

    return new Date(year, month, day, hour, minute, second);
  }

  /**
   * Common timezone mappings for iCal compatibility
   */
  static readonly TIMEZONE_MAPPINGS: Record<string, string> = {
    "Eastern Standard Time": "America/New_York",
    "Central Standard Time": "America/Chicago",
    "Mountain Standard Time": "America/Denver",
    "Pacific Standard Time": "America/Los_Angeles",
    GMT: "UTC",
    "Greenwich Mean Time": "UTC",
    "Coordinated Universal Time": "UTC",
  };

  /**
   * Normalize timezone name to IANA format
   */
  static normalizeTimezone(timezone: string): string {
    // Check mappings first (before checking if it's valid)
    const mapped = this.TIMEZONE_MAPPINGS[timezone];
    if (mapped && this.isValidTimezone(mapped)) {
      return mapped;
    }

    // Check if it's already a valid IANA timezone
    if (this.isValidTimezone(timezone)) {
      return timezone;
    }

    // Default to UTC if we can't resolve
    console.warn(`Unknown timezone: ${timezone}, defaulting to UTC`);
    return "UTC";
  }
}
