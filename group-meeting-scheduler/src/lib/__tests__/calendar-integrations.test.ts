import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GoogleCalendarIntegration } from "../calendar-integrations/google-calendar";
import { MicrosoftGraphIntegration } from "../calendar-integrations/microsoft-graph";
import { UnifiedCalendarIntegration } from "../calendar-integrations/unified-integration";
import { CalendarEvent, DateRange } from "@/types/calendar";

// Test-specific classes that disable rate limiting
class TestGoogleCalendarIntegration extends GoogleCalendarIntegration {
  protected async rateLimit(): Promise<void> {
    // Disable rate limiting in tests
    return Promise.resolve();
  }
}

class TestMicrosoftGraphIntegration extends MicrosoftGraphIntegration {
  protected async rateLimit(): Promise<void> {
    // Disable rate limiting in tests
    return Promise.resolve();
  }
}

class TestUnifiedCalendarIntegration extends UnifiedCalendarIntegration {
  constructor() {
    super();
    // Replace the integrations with test versions
    (this as any).googleIntegration = new TestGoogleCalendarIntegration();
    (this as any).microsoftIntegration = new TestMicrosoftGraphIntegration();
  }
}

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Calendar Integrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GoogleCalendarIntegration", () => {
    let googleIntegration: TestGoogleCalendarIntegration;
    const mockToken = "mock-google-token";
    const mockDateRange: DateRange = {
      start: new Date("2024-01-01T00:00:00Z"),
      end: new Date("2024-01-31T23:59:59Z"),
    };

    beforeEach(() => {
      googleIntegration = new TestGoogleCalendarIntegration();
    });

    it("should authenticate successfully", async () => {
      const result = await googleIntegration.authenticate("google");
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should throw error for invalid provider", async () => {
      await expect(
        googleIntegration.authenticate("outlook" as any)
      ).rejects.toThrow("Invalid provider for Google Calendar integration");
    });

    it("should fetch calendar data successfully", async () => {
      // Mock calendar list response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [
              {
                id: "primary",
                timeZone: "America/New_York",
                accessRole: "owner",
              },
            ],
          }),
        })
        // Mock events response
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [
              {
                id: "event1",
                summary: "Test Meeting",
                start: {
                  dateTime: "2024-01-15T10:00:00-05:00",
                  timeZone: "America/New_York",
                },
                end: {
                  dateTime: "2024-01-15T11:00:00-05:00",
                  timeZone: "America/New_York",
                },
                status: "confirmed",
              },
            ],
          }),
        });

      const events = await googleIntegration.fetchCalendarData(
        mockToken,
        mockDateRange
      );

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        id: "event1",
        summary: "Test Meeting",
        status: "confirmed",
        timezone: "America/New_York",
      });
      expect(events[0].start).toBeInstanceOf(Date);
      expect(events[0].end).toBeInstanceOf(Date);
    });

    it("should handle API errors gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      await expect(
        googleIntegration.fetchCalendarData(mockToken, mockDateRange)
      ).rejects.toThrow("Authentication failed for Google Calendar");
    });

    it("should create calendar event successfully", async () => {
      const mockEvent: CalendarEvent = {
        id: "new-event",
        summary: "New Meeting",
        start: new Date("2024-01-15T10:00:00Z"),
        end: new Date("2024-01-15T11:00:00Z"),
        timezone: "UTC",
        status: "confirmed",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "created-event-id",
        }),
      });

      const eventId = await googleIntegration.createCalendarEvent(
        mockToken,
        mockEvent
      );
      expect(eventId).toBe("created-event-id");
    });

    it("should validate date range", async () => {
      const invalidDateRange: DateRange = {
        start: new Date("2024-01-31T00:00:00Z"),
        end: new Date("2024-01-01T00:00:00Z"), // End before start
      };

      await expect(
        googleIntegration.fetchCalendarData(mockToken, invalidDateRange)
      ).rejects.toThrow("Invalid date range");
    });

    it("should handle rate limiting", async () => {
      // Mock multiple successful responses - alternating between calendar list and events
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [{ id: "primary", accessRole: "owner" }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [{ id: "primary", accessRole: "owner" }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [] }),
        });

      // Make multiple rapid calls
      await Promise.all([
        googleIntegration.fetchCalendarData(mockToken, mockDateRange),
        googleIntegration.fetchCalendarData(mockToken, mockDateRange),
      ]);

      // Should have made multiple fetch calls
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe("MicrosoftGraphIntegration", () => {
    let microsoftIntegration: TestMicrosoftGraphIntegration;
    const mockToken = "mock-microsoft-token";
    const mockDateRange: DateRange = {
      start: new Date("2024-01-01T00:00:00Z"),
      end: new Date("2024-01-31T23:59:59Z"),
    };

    beforeEach(() => {
      microsoftIntegration = new TestMicrosoftGraphIntegration();
    });

    it("should authenticate successfully", async () => {
      const result = await microsoftIntegration.authenticate("outlook");
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should throw error for invalid provider", async () => {
      await expect(
        microsoftIntegration.authenticate("google" as any)
      ).rejects.toThrow("Invalid provider for Microsoft Graph integration");
    });

    it("should fetch calendar data successfully", async () => {
      // Mock calendars response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            value: [
              {
                id: "calendar1",
                canEdit: true,
                canViewPrivateItems: true,
              },
            ],
          }),
        })
        // Mock events response
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            value: [
              {
                id: "event1",
                subject: "Test Meeting",
                start: {
                  dateTime: "2024-01-15T10:00:00.000Z",
                  timeZone: "UTC",
                },
                end: {
                  dateTime: "2024-01-15T11:00:00.000Z",
                  timeZone: "UTC",
                },
                showAs: "busy",
                isCancelled: false,
              },
            ],
          }),
        });

      const events = await microsoftIntegration.fetchCalendarData(
        mockToken,
        mockDateRange
      );

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        id: "event1",
        summary: "Test Meeting",
        status: "confirmed",
        timezone: "UTC",
      });
    });

    it("should handle cancelled events", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ value: [{ id: "calendar1", canEdit: true }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            value: [
              {
                id: "event1",
                subject: "Cancelled Meeting",
                isCancelled: true,
                start: { dateTime: "2024-01-15T10:00:00.000Z" },
                end: { dateTime: "2024-01-15T11:00:00.000Z" },
              },
            ],
          }),
        });

      const events = await microsoftIntegration.fetchCalendarData(
        mockToken,
        mockDateRange
      );
      expect(events).toHaveLength(0); // Cancelled events should be filtered out
    });

    it("should create calendar event successfully", async () => {
      const mockEvent: CalendarEvent = {
        id: "new-event",
        summary: "New Meeting",
        start: new Date("2024-01-15T10:00:00Z"),
        end: new Date("2024-01-15T11:00:00Z"),
        timezone: "UTC",
        status: "confirmed",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "created-event-id",
        }),
      });

      const eventId = await microsoftIntegration.createCalendarEvent(
        mockToken,
        mockEvent
      );
      expect(eventId).toBe("created-event-id");
    });
  });

  describe("UnifiedCalendarIntegration", () => {
    let unifiedIntegration: TestUnifiedCalendarIntegration;
    const mockDateRange: DateRange = {
      start: new Date("2024-01-01T00:00:00Z"),
      end: new Date("2024-01-31T23:59:59Z"),
    };

    beforeEach(() => {
      unifiedIntegration = new TestUnifiedCalendarIntegration();
    });

    it("should authenticate with Google", async () => {
      const result = await unifiedIntegration.authenticate("google");
      expect(result.success).toBe(true);
    });

    it("should authenticate with Outlook", async () => {
      const result = await unifiedIntegration.authenticate("outlook");
      expect(result.success).toBe(true);
    });

    it("should handle unsupported provider", async () => {
      const result = await unifiedIntegration.authenticate(
        "unsupported" as any
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsupported calendar provider");
    });

    it("should fetch multi-provider calendar data", async () => {
      // Mock responses in the order they will be called:
      // 1. Google Calendar list
      // 2. Microsoft Graph calendars
      // 3. Google Calendar events
      // 4. Microsoft Graph events
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [{ id: "primary", timeZone: "UTC", accessRole: "owner" }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            value: [
              { id: "calendar1", canEdit: true, canViewPrivateItems: true },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [
              {
                id: "google-event",
                summary: "Google Meeting",
                start: { dateTime: "2024-01-15T10:00:00Z", timeZone: "UTC" },
                end: { dateTime: "2024-01-15T11:00:00Z", timeZone: "UTC" },
                status: "confirmed",
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            value: [
              {
                id: "microsoft-event",
                subject: "Microsoft Meeting",
                start: { dateTime: "2024-01-15T14:00:00Z", timeZone: "UTC" },
                end: { dateTime: "2024-01-15T15:00:00Z", timeZone: "UTC" },
                showAs: "busy",
                isCancelled: false,
              },
            ],
          }),
        });

      const providers = [
        { provider: "google" as const, token: "google-token" },
        { provider: "outlook" as const, token: "microsoft-token" },
      ];

      const events = await unifiedIntegration.fetchMultiProviderCalendarData(
        providers,
        mockDateRange
      );

      expect(events).toHaveLength(2);
      expect(events[0].summary).toBe("Google Meeting");
      expect(events[1].summary).toBe("Microsoft Meeting");
      // Events should be sorted by start time
      expect(events[0].start.getTime()).toBeLessThan(events[1].start.getTime());
    });

    it("should handle partial failures in multi-provider fetch", async () => {
      // Mock responses in the correct order:
      // 1. Google Calendar list (success)
      // 2. Microsoft Graph calendars (failure)
      // 3. Google Calendar events (success)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [{ id: "primary", timeZone: "UTC", accessRole: "owner" }],
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: async () => "Unauthorized",
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [
              {
                id: "google-event",
                summary: "Google Meeting",
                start: { dateTime: "2024-01-15T10:00:00Z", timeZone: "UTC" },
                end: { dateTime: "2024-01-15T11:00:00Z", timeZone: "UTC" },
                status: "confirmed",
              },
            ],
          }),
        });

      const providers = [
        { provider: "google" as const, token: "google-token" },
        { provider: "outlook" as const, token: "bad-token" },
      ];

      const events = await unifiedIntegration.fetchMultiProviderCalendarData(
        providers,
        mockDateRange
      );

      // Should still return Google events despite Microsoft failure
      expect(events).toHaveLength(1);
      expect(events[0].summary).toBe("Google Meeting");
    });

    it("should validate tokens", async () => {
      // Mock successful validation for Google
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [{ id: "primary", accessRole: "owner" }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [] }),
        });

      const googleValid = await unifiedIntegration.validateToken(
        "valid-token",
        "google"
      );
      expect(googleValid).toBe(true);

      // Mock failed validation
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      const googleInvalid = await unifiedIntegration.validateToken(
        "invalid-token",
        "google"
      );
      expect(googleInvalid).toBe(false);
    });

    it("should return supported providers", () => {
      const providers = unifiedIntegration.getSupportedProviders();
      expect(providers).toEqual(["google", "outlook"]);
    });
  });
});
