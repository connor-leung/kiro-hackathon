import { CalendarEvent, DateRange } from "@/types/calendar";
import { AuthResult } from "@/types/auth";
import { BaseCalendarIntegration } from "./base-integration";

/**
 * Microsoft Graph API integration for Outlook calendars
 */
export class MicrosoftGraphIntegration extends BaseCalendarIntegration {
  protected providerName = "Microsoft Graph";
  private readonly baseUrl = "https://graph.microsoft.com/v1.0";

  async authenticate(provider: "google" | "outlook"): Promise<AuthResult> {
    if (provider !== "outlook") {
      throw new Error("Invalid provider for Microsoft Graph integration");
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
      // Get the user's calendars
      const calendarsResponse = await fetch(`${this.baseUrl}/me/calendars`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!calendarsResponse.ok) {
        throw {
          status: calendarsResponse.status,
          message: await calendarsResponse.text(),
        };
      }

      const calendarsData = await calendarsResponse.json();
      const calendars = calendarsData.value || [];

      // Fetch events from all calendars
      const allEvents: CalendarEvent[] = [];

      for (const calendar of calendars) {
        // Skip calendars that can't be accessed
        if (!calendar.canEdit && !calendar.canViewPrivateItems) {
          continue;
        }

        await this.rateLimit();

        const eventsResponse = await fetch(
          `${this.baseUrl}/me/calendars/${calendar.id}/events?` +
            new URLSearchParams({
              startDateTime: dateRange.start.toISOString(),
              endDateTime: dateRange.end.toISOString(),
              $orderby: "start/dateTime",
              $top: "1000",
              $select:
                "id,subject,start,end,showAs,isCancelled,isAllDay,recurrence",
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
        const events = eventsData.value || [];

        // Convert Microsoft Graph events to our format
        for (const event of events) {
          const calendarEvent = this.convertMicrosoftEvent(event);
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
      const microsoftEvent = this.convertToMicrosoftEvent(event);

      const response = await fetch(`${this.baseUrl}/me/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(microsoftEvent),
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
   * Convert Microsoft Graph event to our CalendarEvent format
   */
  private convertMicrosoftEvent(microsoftEvent: any): CalendarEvent | null {
    // Skip cancelled events
    if (microsoftEvent.isCancelled) {
      return null;
    }

    // Skip events without start/end times
    if (!microsoftEvent.start || !microsoftEvent.end) {
      return null;
    }

    const start = new Date(microsoftEvent.start.dateTime);
    const end = new Date(microsoftEvent.end.dateTime);
    const timezone = microsoftEvent.start.timeZone || "UTC";

    return {
      id: microsoftEvent.id,
      summary: microsoftEvent.subject || "Untitled Event",
      start,
      end,
      timezone,
      status: this.mapMicrosoftStatus(
        microsoftEvent.showAs,
        microsoftEvent.isCancelled
      ),
      // Note: Recurrence handling would need additional API calls to expand
      // For now, we're getting individual instances
    };
  }

  /**
   * Convert our CalendarEvent to Microsoft Graph event format
   */
  private convertToMicrosoftEvent(event: CalendarEvent): any {
    return {
      subject: event.summary,
      start: {
        dateTime: event.start.toISOString(),
        timeZone: event.timezone,
      },
      end: {
        dateTime: event.end.toISOString(),
        timeZone: event.timezone,
      },
      showAs: this.mapToMicrosoftStatus(event.status),
    };
  }

  /**
   * Map Microsoft Graph showAs status to our status format
   */
  private mapMicrosoftStatus(
    showAs: string,
    isCancelled: boolean
  ): "confirmed" | "tentative" | "cancelled" {
    if (isCancelled) {
      return "cancelled";
    }

    switch (showAs) {
      case "busy":
      case "oof": // Out of office
        return "confirmed";
      case "tentative":
        return "tentative";
      case "free":
      case "workingElsewhere":
        return "tentative";
      default:
        return "confirmed";
    }
  }

  /**
   * Map our status format to Microsoft Graph showAs
   */
  private mapToMicrosoftStatus(
    status: "confirmed" | "tentative" | "cancelled"
  ): string {
    switch (status) {
      case "confirmed":
        return "busy";
      case "tentative":
        return "tentative";
      case "cancelled":
        return "free";
      default:
        return "busy";
    }
  }
}
