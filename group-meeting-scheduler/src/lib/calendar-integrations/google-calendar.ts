import { CalendarEvent, DateRange } from "@/types/calendar";
import { AuthResult } from "@/types/auth";
import { BaseCalendarIntegration } from "./base-integration";

/**
 * Google Calendar API integration
 */
export class GoogleCalendarIntegration extends BaseCalendarIntegration {
  protected providerName = "Google Calendar";
  private readonly baseUrl = "https://www.googleapis.com/calendar/v3";

  async authenticate(provider: "google" | "outlook"): Promise<AuthResult> {
    if (provider !== "google") {
      throw new Error("Invalid provider for Google Calendar integration");
    }

    // Authentication is handled by NextAuth.js
    // This method is mainly for validation and future extension
    return {
      success: true,
      error: undefined,
    };
  }

  async fetchCalendarData(
    token: string,
    dateRange: DateRange
  ): Promise<CalendarEvent[]> {
    this.validateDateRange(dateRange);
    await this.rateLimit();

    try {
      // First, get the list of calendars
      const calendarsResponse = await fetch(
        `${this.baseUrl}/users/me/calendarList`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!calendarsResponse.ok) {
        throw {
          status: calendarsResponse.status,
          message: await calendarsResponse.text(),
        };
      }

      const calendarsData = await calendarsResponse.json();
      const calendars = calendarsData.items || [];

      // Fetch events from all calendars
      const allEvents: CalendarEvent[] = [];

      for (const calendar of calendars) {
        // Skip calendars that are not accessible or hidden
        if (calendar.accessRole === "none" || calendar.hidden) {
          continue;
        }

        await this.rateLimit();

        const eventsResponse = await fetch(
          `${this.baseUrl}/calendars/${encodeURIComponent(
            calendar.id
          )}/events?` +
            new URLSearchParams({
              timeMin: dateRange.start.toISOString(),
              timeMax: dateRange.end.toISOString(),
              singleEvents: "true",
              orderBy: "startTime",
              maxResults: "2500",
            }),
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!eventsResponse.ok) {
          console.warn(
            `Failed to fetch events from calendar ${calendar.id}:`,
            eventsResponse.status
          );
          continue;
        }

        const eventsData = await eventsResponse.json();
        const events = eventsData.items || [];

        // Convert Google Calendar events to our format
        for (const event of events) {
          const calendarEvent = this.convertGoogleEvent(
            event,
            calendar.timeZone
          );
          if (calendarEvent) {
            allEvents.push(calendarEvent);
          }
        }
      }

      return allEvents;
    } catch (error) {
      this.handleApiError(error, "fetching calendar data");
    }
  }

  async createCalendarEvent(
    token: string,
    event: CalendarEvent
  ): Promise<string> {
    await this.rateLimit();

    try {
      const googleEvent = this.convertToGoogleEvent(event);

      const response = await fetch(`${this.baseUrl}/calendars/primary/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(googleEvent),
      });

      if (!response.ok) {
        throw {
          status: response.status,
          message: await response.text(),
        };
      }

      const createdEvent = await response.json();
      return createdEvent.id;
    } catch (error) {
      this.handleApiError(error, "creating calendar event");
    }
  }

  /**
   * Convert Google Calendar event to our CalendarEvent format
   */
  private convertGoogleEvent(
    googleEvent: any,
    calendarTimeZone: string
  ): CalendarEvent | null {
    // Skip events without start/end times (like all-day events without specific times)
    if (!googleEvent.start || !googleEvent.end) {
      return null;
    }

    // Handle all-day events
    const isAllDay = !!googleEvent.start.date;

    let start: Date;
    let end: Date;
    let timezone: string;

    if (isAllDay) {
      // All-day events use date format (YYYY-MM-DD)
      start = new Date(googleEvent.start.date + "T00:00:00");
      end = new Date(googleEvent.end.date + "T00:00:00");
      timezone = calendarTimeZone || "UTC";
    } else {
      // Timed events use dateTime format
      start = new Date(googleEvent.start.dateTime);
      end = new Date(googleEvent.end.dateTime);
      timezone = googleEvent.start.timeZone || calendarTimeZone || "UTC";
    }

    return {
      id: googleEvent.id,
      summary: googleEvent.summary || "Untitled Event",
      start,
      end,
      timezone,
      status: this.mapGoogleStatus(googleEvent.status),
      // Note: Recurrence is handled by singleEvents=true parameter
      // which expands recurring events into individual instances
    };
  }

  /**
   * Convert our CalendarEvent to Google Calendar event format
   */
  private convertToGoogleEvent(event: CalendarEvent): any {
    return {
      summary: event.summary,
      start: {
        dateTime: event.start.toISOString(),
        timeZone: event.timezone,
      },
      end: {
        dateTime: event.end.toISOString(),
        timeZone: event.timezone,
      },
      status: this.mapToGoogleStatus(event.status),
    };
  }

  /**
   * Map Google Calendar status to our status format
   */
  private mapGoogleStatus(
    googleStatus: string
  ): "confirmed" | "tentative" | "cancelled" {
    switch (googleStatus) {
      case "confirmed":
        return "confirmed";
      case "tentative":
        return "tentative";
      case "cancelled":
        return "cancelled";
      default:
        return "confirmed";
    }
  }

  /**
   * Map our status format to Google Calendar status
   */
  private mapToGoogleStatus(
    status: "confirmed" | "tentative" | "cancelled"
  ): string {
    return status; // Direct mapping
  }
}
