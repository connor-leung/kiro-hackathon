import { CalendarEvent, DateRange } from "@/types/calendar";
import { AuthResult, CalendarIntegration } from "@/types/auth";
import { GoogleCalendarIntegration } from "./google-calendar";
import { MicrosoftGraphIntegration } from "./microsoft-graph";

/**
 * Unified calendar integration service that provides a single interface
 * for all calendar providers
 */
export class UnifiedCalendarIntegration {
  private googleIntegration: GoogleCalendarIntegration;
  private microsoftIntegration: MicrosoftGraphIntegration;

  constructor() {
    this.googleIntegration = new GoogleCalendarIntegration();
    this.microsoftIntegration = new MicrosoftGraphIntegration();
  }

  async authenticate(provider: "google" | "outlook"): Promise<AuthResult> {
    try {
      switch (provider) {
        case "google":
          return await this.googleIntegration.authenticate(provider);
        case "outlook":
          return await this.microsoftIntegration.authenticate(provider);
        default:
          throw new Error(`Unsupported calendar provider: ${provider}`);
      }
    } catch (error) {
      console.error(`Authentication failed for ${provider}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Authentication failed",
      };
    }
  }

  async fetchCalendarData(
    token: string,
    dateRange: DateRange,
    provider?: "google" | "outlook"
  ): Promise<CalendarEvent[]> {
    if (!provider) {
      throw new Error("Provider must be specified for fetchCalendarData");
    }
    try {
      switch (provider) {
        case "google":
          return await this.googleIntegration.fetchCalendarData(
            token,
            dateRange
          );
        case "outlook":
          return await this.microsoftIntegration.fetchCalendarData(
            token,
            dateRange
          );
        default:
          throw new Error(`Unsupported calendar provider: ${provider}`);
      }
    } catch (error) {
      console.error(`Failed to fetch calendar data from ${provider}:`, error);
      throw error;
    }
  }

  async createCalendarEvent(
    token: string,
    event: CalendarEvent,
    provider?: "google" | "outlook"
  ): Promise<string> {
    if (!provider) {
      throw new Error("Provider must be specified for createCalendarEvent");
    }
    try {
      switch (provider) {
        case "google":
          return await this.googleIntegration.createCalendarEvent(token, event);
        case "outlook":
          return await this.microsoftIntegration.createCalendarEvent(
            token,
            event
          );
        default:
          throw new Error(`Unsupported calendar provider: ${provider}`);
      }
    } catch (error) {
      console.error(`Failed to create calendar event in ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Fetch calendar data from multiple providers and merge results
   */
  async fetchMultiProviderCalendarData(
    providers: Array<{
      provider: "google" | "outlook";
      token: string;
    }>,
    dateRange: DateRange
  ): Promise<CalendarEvent[]> {
    const allEvents: CalendarEvent[] = [];
    const errors: Array<{ provider: string; error: string }> = [];

    // Fetch from all providers in parallel
    const fetchPromises = providers.map(async ({ provider, token }) => {
      try {
        const events = await this.fetchCalendarData(token, dateRange, provider);
        return { provider, events, error: null };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        errors.push({ provider, error: errorMessage });
        return { provider, events: [], error: errorMessage };
      }
    });

    const results = await Promise.all(fetchPromises);

    // Collect all successful events
    for (const result of results) {
      if (result.events.length > 0) {
        allEvents.push(...result.events);
      }
    }

    // Log errors but don't fail the entire operation
    if (errors.length > 0) {
      console.warn("Some calendar providers failed:", errors);
    }

    // Sort events by start time
    allEvents.sort((a, b) => a.start.getTime() - b.start.getTime());

    return allEvents;
  }

  /**
   * Get supported providers
   */
  getSupportedProviders(): Array<"google" | "outlook"> {
    return ["google", "outlook"];
  }

  /**
   * Validate provider token (basic check)
   */
  async validateToken(
    token: string,
    provider: "google" | "outlook"
  ): Promise<boolean> {
    try {
      // Try to fetch a small amount of data to validate the token
      const testDateRange: DateRange = {
        start: new Date(),
        end: new Date(Date.now() + 24 * 60 * 60 * 1000), // Next 24 hours
      };

      await this.fetchCalendarData(token, testDateRange, provider);
      return true;
    } catch (error) {
      console.warn(`Token validation failed for ${provider}:`, error);
      return false;
    }
  }
}

/**
 * Calendar integration wrapper that implements the CalendarIntegration interface
 * for backward compatibility
 */
export class CalendarIntegrationWrapper implements CalendarIntegration {
  private unified: UnifiedCalendarIntegration;

  constructor() {
    this.unified = new UnifiedCalendarIntegration();
  }

  async authenticate(provider: "google" | "outlook"): Promise<AuthResult> {
    return this.unified.authenticate(provider);
  }

  async fetchCalendarData(
    token: string,
    dateRange: DateRange
  ): Promise<CalendarEvent[]> {
    throw new Error(
      "Provider must be specified. Use UnifiedCalendarIntegration directly."
    );
  }

  async createCalendarEvent(
    token: string,
    event: CalendarEvent
  ): Promise<string> {
    throw new Error(
      "Provider must be specified. Use UnifiedCalendarIntegration directly."
    );
  }
}
