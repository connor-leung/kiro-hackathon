import { RRule } from "rrule";

/**
 * Core calendar event interface representing a single calendar entry
 */
export interface CalendarEvent {
  id: string;
  summary: string;
  start: Date;
  end: Date;
  timezone: string;
  recurrence?: RRule;
  status: "confirmed" | "tentative" | "cancelled";
}

/**
 * Represents a participant's complete calendar data
 */
export interface ParticipantCalendar {
  participantId: string;
  name: string;
  timezone: string;
  events: CalendarEvent[];
  source: "ical" | "google" | "outlook" | "apple";
}

/**
 * Date range interface for calendar queries
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Recurrence rule interface for recurring events
 */
export interface RecurrenceRule {
  freq: string;
  interval?: number;
  until?: Date;
  count?: number;
  byweekday?: number[];
  bymonthday?: number[];
  bymonth?: number[];
}
