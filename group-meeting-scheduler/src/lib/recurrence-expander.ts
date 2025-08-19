import { RRule } from "rrule";
import { CalendarEvent, DateRange } from "@/types/calendar";
import { addDays, isBefore, isAfter, differenceInMilliseconds } from "date-fns";

/**
 * Recurring event expansion utilities
 */
export class RecurrenceExpander {
  /**
   * Expand recurring events within a date range
   */
  static expandRecurringEvents(
    events: CalendarEvent[],
    dateRange: DateRange,
    maxOccurrences: number = 1000
  ): CalendarEvent[] {
    const expandedEvents: CalendarEvent[] = [];

    for (const event of events) {
      if (event.recurrence) {
        const occurrences = this.expandSingleEvent(
          event,
          dateRange,
          maxOccurrences
        );
        expandedEvents.push(...occurrences);
      } else {
        // Include non-recurring events if they fall within the range
        if (this.eventIntersectsRange(event, dateRange)) {
          expandedEvents.push(event);
        }
      }
    }

    return expandedEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  /**
   * Expand a single recurring event
   */
  static expandSingleEvent(
    event: CalendarEvent,
    dateRange: DateRange,
    maxOccurrences: number = 1000
  ): CalendarEvent[] {
    if (!event.recurrence) {
      return this.eventIntersectsRange(event, dateRange) ? [event] : [];
    }

    const occurrences: CalendarEvent[] = [];
    const eventDuration = differenceInMilliseconds(event.end, event.start);

    try {
      // Generate occurrences using RRule
      const rrule = event.recurrence;
      const dates = rrule.between(
        dateRange.start,
        addDays(dateRange.end, 1), // Add buffer for events that might start before range end
        true, // inclusive
        (date, i) => i < maxOccurrences
      );

      for (const startDate of dates) {
        const endDate = new Date(startDate.getTime() + eventDuration);

        // Create occurrence
        const occurrence: CalendarEvent = {
          ...event,
          id: `${event.id}_${startDate.getTime()}`,
          start: startDate,
          end: endDate,
        };

        // Only include if it intersects with our date range
        if (this.eventIntersectsRange(occurrence, dateRange)) {
          occurrences.push(occurrence);
        }
      }
    } catch (error) {
      console.warn(`Failed to expand recurring event ${event.id}:`, error);
      // Fallback: include original event if it's in range
      if (this.eventIntersectsRange(event, dateRange)) {
        occurrences.push(event);
      }
    }

    return occurrences;
  }

  /**
   * Check if an event intersects with a date range
   */
  static eventIntersectsRange(event: CalendarEvent, range: DateRange): boolean {
    return !(
      isAfter(event.start, range.end) || isBefore(event.end, range.start)
    );
  }

  /**
   * Create a date range for event expansion (typically wider than the scheduling range)
   */
  static createExpansionRange(
    schedulingRange: DateRange,
    bufferDays: number = 30
  ): DateRange {
    return {
      start: addDays(schedulingRange.start, -bufferDays),
      end: addDays(schedulingRange.end, bufferDays),
    };
  }

  /**
   * Filter expanded events to only include those relevant for scheduling
   */
  static filterRelevantEvents(
    events: CalendarEvent[],
    schedulingRange: DateRange
  ): CalendarEvent[] {
    return events.filter((event) =>
      this.eventIntersectsRange(event, schedulingRange)
    );
  }

  /**
   * Get the next N occurrences of a recurring event
   */
  static getNextOccurrences(
    event: CalendarEvent,
    count: number = 10,
    after?: Date
  ): CalendarEvent[] {
    if (!event.recurrence) {
      return after && isAfter(event.start, after) ? [event] : [];
    }

    const startDate = after || new Date();
    const occurrences: CalendarEvent[] = [];
    const eventDuration = differenceInMilliseconds(event.end, event.start);

    try {
      const rrule = event.recurrence;
      const dates = rrule.after(startDate, false, count);

      if (Array.isArray(dates)) {
        for (const date of dates) {
          const endDate = new Date(date.getTime() + eventDuration);
          occurrences.push({
            ...event,
            id: `${event.id}_${date.getTime()}`,
            start: date,
            end: endDate,
          });
        }
      } else if (dates) {
        // Single date returned
        const endDate = new Date(dates.getTime() + eventDuration);
        occurrences.push({
          ...event,
          id: `${event.id}_${dates.getTime()}`,
          start: dates,
          end: endDate,
        });
      }
    } catch (error) {
      console.warn(
        `Failed to get next occurrences for event ${event.id}:`,
        error
      );
    }

    return occurrences;
  }

  /**
   * Check if a recurring event has ended (no more future occurrences)
   */
  static hasRecurrenceEnded(event: CalendarEvent, checkDate?: Date): boolean {
    if (!event.recurrence) {
      return true;
    }

    const date = checkDate || new Date();

    try {
      const nextOccurrence = event.recurrence.after(date, false);
      return nextOccurrence === null;
    } catch (error) {
      console.warn(
        `Failed to check recurrence end for event ${event.id}:`,
        error
      );
      return true;
    }
  }

  /**
   * Validate that a recurrence rule is reasonable (not too frequent or infinite)
   */
  static validateRecurrenceRule(rrule: RRule): {
    isValid: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let isValid = true;

    try {
      // Check if rule is too frequent
      const freq = rrule.options.freq;
      const interval = rrule.options.interval || 1;

      if (freq === RRule.MINUTELY && interval < 15) {
        warnings.push(
          "Very frequent recurrence (less than 15 minutes) may cause performance issues"
        );
      }

      if (freq === RRule.SECONDLY) {
        warnings.push(
          "Second-level recurrence is not recommended for calendar events"
        );
        isValid = false;
      }

      // Check for infinite recurrence without reasonable bounds
      if (!rrule.options.until && !rrule.options.count) {
        const testDate = new Date();
        testDate.setFullYear(testDate.getFullYear() + 5);

        const futureOccurrences = rrule.between(new Date(), testDate, true);
        if (futureOccurrences.length > 2000) {
          warnings.push(
            "Infinite recurrence with high frequency may cause performance issues"
          );
        }
      }

      // Check for very long duration rules
      if (rrule.options.count && rrule.options.count > 5000) {
        warnings.push(
          "Very high occurrence count may cause performance issues"
        );
      }
    } catch (error) {
      warnings.push(
        `Failed to validate recurrence rule: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      isValid = false;
    }

    return { isValid, warnings };
  }
}
