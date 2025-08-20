import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/meetings/analyze/route";
import { GET, DELETE } from "@/app/api/calendars/[sessionId]/route";
import {
  createUploadSession,
  addParticipantToSession,
} from "@/lib/upload-session";
import { ParticipantCalendar } from "@/types/calendar";
import { MeetingAnalysisRequest } from "@/types/api";

// Mock Redis cache
vi.mock("@/lib/redis-cache", () => ({
  redisCache: {
    isAvailable: () => false,
    setSchedulingSession: vi.fn(),
    getSchedulingSession: vi.fn(),
    deleteSchedulingSession: vi.fn(),
  },
}));

// Mock MeetingScheduler
vi.mock("@/lib/meeting-scheduler", () => ({
  MeetingScheduler: vi.fn().mockImplementation(() => ({
    scheduleOptimalMeeting: vi.fn().mockResolvedValue({
      availableSlots: [
        {
          start: new Date("2024-01-15T10:00:00Z"),
          end: new Date("2024-01-15T11:00:00Z"),
          score: 95,
          conflicts: [],
          timezoneDisplay: {
            "America/New_York": "Jan 15, 10:00 AM - 11:00 AM",
            "Europe/London": "Jan 15, 3:00 PM - 4:00 PM",
          },
        },
        {
          start: new Date("2024-01-15T14:00:00Z"),
          end: new Date("2024-01-15T15:00:00Z"),
          score: 88,
          conflicts: [],
          timezoneDisplay: {
            "America/New_York": "Jan 15, 2:00 PM - 3:00 PM",
            "Europe/London": "Jan 15, 7:00 PM - 8:00 PM",
          },
        },
      ],
      conflictAnalysis: {
        totalConflicts: 0,
        participantConflicts: {},
        conflictsByTimeSlot: {},
      },
      recommendations: [
        {
          start: new Date("2024-01-15T10:00:00Z"),
          end: new Date("2024-01-15T11:00:00Z"),
          score: 95,
          conflicts: [],
          timezoneDisplay: {
            "America/New_York": "Jan 15, 10:00 AM - 11:00 AM",
            "Europe/London": "Jan 15, 3:00 PM - 4:00 PM",
          },
        },
      ],
    }),
  })),
}));

describe("Meeting Analysis API", () => {
  let sessionId: string;
  let mockParticipants: ParticipantCalendar[];

  beforeEach(async () => {
    // Create test session with participants
    const session = await createUploadSession();
    sessionId = session.id;

    mockParticipants = [
      {
        participantId: "participant-1",
        name: "John Doe",
        timezone: "America/New_York",
        source: "ical",
        events: [
          {
            id: "event-1",
            summary: "Existing Meeting",
            start: new Date("2024-01-15T09:00:00Z"),
            end: new Date("2024-01-15T09:30:00Z"),
            timezone: "America/New_York",
            status: "confirmed",
          },
        ],
      },
      {
        participantId: "participant-2",
        name: "Jane Smith",
        timezone: "Europe/London",
        source: "ical",
        events: [
          {
            id: "event-2",
            summary: "Team Standup",
            start: new Date("2024-01-15T08:00:00Z"),
            end: new Date("2024-01-15T08:30:00Z"),
            timezone: "Europe/London",
            status: "confirmed",
          },
        ],
      },
    ];

    // Add participants to session
    for (const participant of mockParticipants) {
      await addParticipantToSession(sessionId, participant);
    }
  });

  describe("POST /api/meetings/analyze", () => {
    it("should analyze meeting availability successfully", async () => {
      const requestBody: MeetingAnalysisRequest = {
        sessionId,
        preferences: {
          duration: 60,
          timeRangeStart: "09:00",
          timeRangeEnd: "17:00",
          excludeWeekends: true,
          excludedDates: [],
          bufferTime: 0,
          preferredTimezones: ["America/New_York"],
        },
      };

      const request = new NextRequest(
        "http://localhost:3000/api/meetings/analyze",
        {
          method: "POST",
          body: JSON.stringify(requestBody),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty("sessionId", sessionId);
      expect(data).toHaveProperty("results");
      expect(data).toHaveProperty("processingTime");
      expect(data.results).toHaveProperty("availableSlots");
      expect(data.results).toHaveProperty("conflictAnalysis");
      expect(data.results).toHaveProperty("recommendations");
      expect(Array.isArray(data.results.availableSlots)).toBe(true);
      expect(data.results.availableSlots.length).toBeGreaterThan(0);
    });

    it("should return error for invalid session ID", async () => {
      const requestBody: MeetingAnalysisRequest = {
        sessionId: "invalid-session-id",
        preferences: {
          duration: 60,
          timeRangeStart: "09:00",
          timeRangeEnd: "17:00",
          excludeWeekends: true,
          excludedDates: [],
          bufferTime: 0,
          preferredTimezones: [],
        },
      };

      const request = new NextRequest(
        "http://localhost:3000/api/meetings/analyze",
        {
          method: "POST",
          body: JSON.stringify(requestBody),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe("SESSION_NOT_FOUND");
    });

    it("should return error for missing request body", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/meetings/analyze",
        {
          method: "POST",
          body: JSON.stringify({}),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("INVALID_REQUEST");
    });

    it("should return error for invalid preferences", async () => {
      const requestBody = {
        sessionId,
        preferences: {
          duration: -30, // Invalid negative duration
          timeRangeStart: "25:00", // Invalid time format
          timeRangeEnd: "17:00",
          excludeWeekends: true,
          excludedDates: [],
          bufferTime: 0,
          preferredTimezones: [],
        },
      };

      const request = new NextRequest(
        "http://localhost:3000/api/meetings/analyze",
        {
          method: "POST",
          body: JSON.stringify(requestBody),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("INVALID_PREFERENCES");
    });

    it("should validate time range order", async () => {
      const requestBody = {
        sessionId,
        preferences: {
          duration: 60,
          timeRangeStart: "17:00", // Start after end
          timeRangeEnd: "09:00",
          excludeWeekends: true,
          excludedDates: [],
          bufferTime: 0,
          preferredTimezones: [],
        },
      };

      const request = new NextRequest(
        "http://localhost:3000/api/meetings/analyze",
        {
          method: "POST",
          body: JSON.stringify(requestBody),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("INVALID_PREFERENCES");
      expect(data.error.message).toContain(
        "timeRangeStart must be before timeRangeEnd"
      );
    });

    it("should validate duration limits", async () => {
      const requestBody = {
        sessionId,
        preferences: {
          duration: 600, // 10 hours - exceeds limit
          timeRangeStart: "09:00",
          timeRangeEnd: "17:00",
          excludeWeekends: true,
          excludedDates: [],
          bufferTime: 0,
          preferredTimezones: [],
        },
      };

      const request = new NextRequest(
        "http://localhost:3000/api/meetings/analyze",
        {
          method: "POST",
          body: JSON.stringify(requestBody),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("INVALID_PREFERENCES");
      expect(data.error.message).toContain("Duration cannot exceed 8 hours");
    });
  });

  describe("GET /api/calendars/[sessionId]", () => {
    it("should retrieve session data successfully", async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/calendars/${sessionId}`
      );
      const params = Promise.resolve({ sessionId });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty("sessionId", sessionId);
      expect(data).toHaveProperty("participantCount", 2);
      expect(data).toHaveProperty("participants");
      expect(Array.isArray(data.participants)).toBe(true);
      expect(data.participants).toHaveLength(2);
    });

    it("should return error for non-existent session", async () => {
      const invalidSessionId = "non-existent-session";
      const request = new NextRequest(
        `http://localhost:3000/api/calendars/${invalidSessionId}`
      );
      const params = Promise.resolve({ sessionId: invalidSessionId });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe("SESSION_NOT_FOUND");
    });
  });

  describe("DELETE /api/calendars/[sessionId]", () => {
    it("should delete session successfully", async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/calendars/${sessionId}`,
        {
          method: "DELETE",
        }
      );
      const params = Promise.resolve({ sessionId });

      const response = await DELETE(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty("message", "Session deleted successfully");
      expect(data).toHaveProperty("sessionId", sessionId);
    });

    it("should return error when trying to delete non-existent session", async () => {
      const invalidSessionId = "non-existent-session";
      const request = new NextRequest(
        `http://localhost:3000/api/calendars/${invalidSessionId}`,
        {
          method: "DELETE",
        }
      );
      const params = Promise.resolve({ sessionId: invalidSessionId });

      const response = await DELETE(request, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe("SESSION_NOT_FOUND");
    });

    it("should verify session is actually deleted", async () => {
      // First delete the session
      const deleteRequest = new NextRequest(
        `http://localhost:3000/api/calendars/${sessionId}`,
        {
          method: "DELETE",
        }
      );
      const deleteParams = Promise.resolve({ sessionId });
      await DELETE(deleteRequest, { params: deleteParams });

      // Then try to retrieve it
      const getRequest = new NextRequest(
        `http://localhost:3000/api/calendars/${sessionId}`
      );
      const getParams = Promise.resolve({ sessionId });
      const response = await GET(getRequest, { params: getParams });

      expect(response.status).toBe(404);
    });
  });

  describe("Edge Cases", () => {
    it("should handle session with no participants", async () => {
      const emptySession = await createUploadSession();
      const requestBody: MeetingAnalysisRequest = {
        sessionId: emptySession.id,
        preferences: {
          duration: 60,
          timeRangeStart: "09:00",
          timeRangeEnd: "17:00",
          excludeWeekends: true,
          excludedDates: [],
          bufferTime: 0,
          preferredTimezones: [],
        },
      };

      const request = new NextRequest(
        "http://localhost:3000/api/meetings/analyze",
        {
          method: "POST",
          body: JSON.stringify(requestBody),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("NO_PARTICIPANTS");
    });

    it("should handle participants with no events", async () => {
      const emptySession = await createUploadSession();
      const emptyParticipant: ParticipantCalendar = {
        participantId: "empty-participant",
        name: "Empty Calendar",
        timezone: "America/New_York",
        source: "ical",
        events: [], // No events
      };

      await addParticipantToSession(emptySession.id, emptyParticipant);

      const requestBody: MeetingAnalysisRequest = {
        sessionId: emptySession.id,
        preferences: {
          duration: 60,
          timeRangeStart: "09:00",
          timeRangeEnd: "17:00",
          excludeWeekends: true,
          excludedDates: [],
          bufferTime: 0,
          preferredTimezones: [],
        },
      };

      const request = new NextRequest(
        "http://localhost:3000/api/meetings/analyze",
        {
          method: "POST",
          body: JSON.stringify(requestBody),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("NO_CALENDAR_DATA");
    });
  });
});
