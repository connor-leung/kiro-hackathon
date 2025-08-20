import { CalendarEvent, DateRange } from "@/types/calendar";
import { AuthResult } from "@/types/auth";

/**
 * Base class for calendar integrations with common functionality
 */
export abstract class BaseCalendarIntegration {
  protected abstract providerName: string;
  protected rateLimitDelay = 100; // ms between requests
  private lastRequestTime = 0;

  /**
   * Rate limiting helper to prevent API abuse
   */
  protected async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.rateLimitDelay) {
      const delay = this.rateLimitDelay - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Generic error handler for API calls
   */
  protected handleApiError(error: any, operation: string): never {
    console.error(`${this.providerName} API error during ${operation}:`, error);

    if (error.status === 401) {
      throw new Error(
        `Authentication failed for ${this.providerName}. Please re-authenticate.`
      );
    } else if (error.status === 403) {
      throw new Error(
        `Access denied for ${this.providerName}. Check permissions.`
      );
    } else if (error.status === 429) {
      throw new Error(
        `Rate limit exceeded for ${this.providerName}. Please try again later.`
      );
    } else if (error.status >= 500) {
      throw new Error(
        `${this.providerName} service is temporarily unavailable. Please try again later.`
      );
    } else {
      throw new Error(
        `${this.providerName} integration error: ${
          error.message || "Unknown error"
        }`
      );
    }
  }

  /**
   * Validate date range for calendar queries
   */
  protected validateDateRange(dateRange: DateRange): void {
    if (dateRange.start >= dateRange.end) {
      throw new Error("Invalid date range: start date must be before end date");
    }

    const maxRangeMonths = 12;
    const maxEndDate = new Date(dateRange.start);
    maxEndDate.setMonth(maxEndDate.getMonth() + maxRangeMonths);

    if (dateRange.end > maxEndDate) {
      throw new Error(
        `Date range too large. Maximum range is ${maxRangeMonths} months.`
      );
    }
  }

  /**
   * Abstract methods to be implemented by specific integrations
   */
  abstract authenticate(provider: "google" | "outlook"): Promise<AuthResult>;
  abstract fetchCalendarData(
    token: string,
    dateRange: DateRange
  ): Promise<CalendarEvent[]>;
  abstract createCalendarEvent(
    token: string,
    event: CalendarEvent
  ): Promise<string>;
}
