import { describe, it, expect, beforeEach, vi } from "vitest";
import { RedisCache } from "@/lib/redis-cache";
import { UploadSession } from "@/lib/upload-session";
import { SchedulingSession } from "@/types/scheduling";
import { ParticipantCalendar } from "@/types/calendar";

// Mock Upstash Redis
const mockRedis = {
  setex: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  expire: vi.fn(),
  keys: vi.fn(),
  ping: vi.fn(),
};

vi.mock("@upstash/redis", () => ({
  Redis: vi.fn().mockImplementation(() => mockRedis),
}));

describe("RedisCache", () => {
  let redisCache: RedisCache;
  let mockUploadSession: UploadSession;
  let mockSchedulingSession: SchedulingSession;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock environment variables
    process.env.UPSTASH_REDIS_REST_URL = "https://test-redis.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

    redisCache = new RedisCache();

    mockUploadSession = {
      id: "test-session-id",
      createdAt: new Date("2024-01-15T10:00:00Z"),
      expiresAt: new Date("2024-01-16T10:00:00Z"),
      participants: [
        {
          participantId: "participant-1",
          name: "John Doe",
          timezone: "America/New_York",
          source: "ical",
          events: [
            {
              id: "event-1",
              summary: "Test Event",
              start: new Date("2024-01-15T14:00:00Z"),
              end: new Date("2024-01-15T15:00:00Z"),
              timezone: "America/New_York",
              status: "confirmed",
            },
          ],
        },
      ],
      uploadedFiles: [
        {
          id: "file-1",
          originalName: "calendar.ics",
          blobUrl: "https://blob.vercel-storage.com/test-file",
          size: 1024,
          uploadedAt: new Date("2024-01-15T10:00:00Z"),
          processed: true,
        },
      ],
    };

    mockSchedulingSession = {
      id: "test-session-id",
      createdAt: new Date("2024-01-15T10:00:00Z"),
      expiresAt: new Date("2024-01-16T10:00:00Z"),
      participants: mockUploadSession.participants,
      preferences: {
        duration: 60,
        timeRangeStart: "09:00",
        timeRangeEnd: "17:00",
        excludeWeekends: true,
        excludedDates: [],
        bufferTime: 0,
        preferredTimezones: ["America/New_York"],
      },
      results: {
        availableSlots: [
          {
            start: new Date("2024-01-15T16:00:00Z"),
            end: new Date("2024-01-15T17:00:00Z"),
            score: 95,
            conflicts: [],
            timezoneDisplay: {
              "America/New_York": "Jan 15, 12:00 PM - 1:00 PM",
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
            start: new Date("2024-01-15T16:00:00Z"),
            end: new Date("2024-01-15T17:00:00Z"),
            score: 95,
            conflicts: [],
            timezoneDisplay: {
              "America/New_York": "Jan 15, 12:00 PM - 1:00 PM",
            },
          },
        ],
      },
    };
  });

  describe("isAvailable", () => {
    it("should return true when Redis is configured", () => {
      expect(redisCache.isAvailable()).toBe(true);
    });

    it("should return false when Redis is not configured", () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;

      const cacheWithoutRedis = new RedisCache();
      expect(cacheWithoutRedis.isAvailable()).toBe(false);
    });
  });

  describe("Upload Session Operations", () => {
    it("should store upload session successfully", async () => {
      mockRedis.setex.mockResolvedValue("OK");

      const result = await redisCache.setUploadSession(
        "test-session-id",
        mockUploadSession
      );

      expect(result).toBe(true);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "upload_session:test-session-id",
        24 * 60 * 60, // 24 hours in seconds
        expect.stringContaining('"id":"test-session-id"')
      );
    });

    it("should retrieve upload session successfully", async () => {
      const serializedSession = JSON.stringify({
        ...mockUploadSession,
        createdAt: mockUploadSession.createdAt.toISOString(),
        expiresAt: mockUploadSession.expiresAt.toISOString(),
        participants: mockUploadSession.participants.map((p) => ({
          ...p,
          events: p.events.map((e) => ({
            ...e,
            start: e.start.toISOString(),
            end: e.end.toISOString(),
          })),
        })),
        uploadedFiles: mockUploadSession.uploadedFiles.map((f) => ({
          ...f,
          uploadedAt: f.uploadedAt.toISOString(),
        })),
      });

      mockRedis.get.mockResolvedValue(serializedSession);

      const result = await redisCache.getUploadSession("test-session-id");

      expect(result).toBeDefined();
      expect(result?.id).toBe("test-session-id");
      expect(result?.createdAt).toBeInstanceOf(Date);
      expect(result?.participants[0].events[0].start).toBeInstanceOf(Date);
      expect(mockRedis.get).toHaveBeenCalledWith(
        "upload_session:test-session-id"
      );
    });

    it("should return null when session not found", async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await redisCache.getUploadSession("non-existent-session");

      expect(result).toBeNull();
    });

    it("should delete upload session successfully", async () => {
      mockRedis.del.mockResolvedValue(1);

      const result = await redisCache.deleteUploadSession("test-session-id");

      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith(
        "upload_session:test-session-id"
      );
    });

    it("should handle Redis errors gracefully", async () => {
      mockRedis.setex.mockRejectedValue(new Error("Redis connection failed"));

      const result = await redisCache.setUploadSession(
        "test-session-id",
        mockUploadSession
      );

      expect(result).toBe(false);
    });
  });

  describe("Scheduling Session Operations", () => {
    it("should store scheduling session successfully", async () => {
      mockRedis.setex.mockResolvedValue("OK");

      const result = await redisCache.setSchedulingSession(
        "test-session-id",
        mockSchedulingSession
      );

      expect(result).toBe(true);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "scheduling_session:test-session-id",
        24 * 60 * 60, // 24 hours in seconds
        expect.stringContaining('"id":"test-session-id"')
      );
    });

    it("should retrieve scheduling session successfully", async () => {
      const serializedSession = JSON.stringify({
        ...mockSchedulingSession,
        createdAt: mockSchedulingSession.createdAt.toISOString(),
        expiresAt: mockSchedulingSession.expiresAt.toISOString(),
        participants: mockSchedulingSession.participants.map((p) => ({
          ...p,
          events: p.events.map((e) => ({
            ...e,
            start: e.start.toISOString(),
            end: e.end.toISOString(),
          })),
        })),
        preferences: {
          ...mockSchedulingSession.preferences,
          excludedDates: mockSchedulingSession.preferences.excludedDates.map(
            (d) => d.toISOString()
          ),
        },
        results: {
          ...mockSchedulingSession.results!,
          availableSlots: mockSchedulingSession.results!.availableSlots.map(
            (slot) => ({
              ...slot,
              start: slot.start.toISOString(),
              end: slot.end.toISOString(),
            })
          ),
          recommendations: mockSchedulingSession.results!.recommendations.map(
            (slot) => ({
              ...slot,
              start: slot.start.toISOString(),
              end: slot.end.toISOString(),
            })
          ),
        },
      });

      mockRedis.get.mockResolvedValue(serializedSession);

      const result = await redisCache.getSchedulingSession("test-session-id");

      expect(result).toBeDefined();
      expect(result?.id).toBe("test-session-id");
      expect(result?.results?.availableSlots[0].start).toBeInstanceOf(Date);
      expect(result?.preferences.excludedDates).toEqual([]);
    });

    it("should delete scheduling session successfully", async () => {
      mockRedis.del.mockResolvedValue(1);

      const result = await redisCache.deleteSchedulingSession(
        "test-session-id"
      );

      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith(
        "scheduling_session:test-session-id"
      );
    });
  });

  describe("Utility Operations", () => {
    it("should extend session expiration successfully", async () => {
      mockRedis.expire.mockResolvedValue(1);

      const result = await redisCache.extendSessionExpiration(
        "test-session-id",
        "upload"
      );

      expect(result).toBe(true);
      expect(mockRedis.expire).toHaveBeenCalledWith(
        "upload_session:test-session-id",
        24 * 60 * 60
      );
    });

    it("should get cache statistics", async () => {
      mockRedis.keys
        .mockResolvedValueOnce(["upload_session:1", "upload_session:2"])
        .mockResolvedValueOnce(["scheduling_session:1"])
        .mockResolvedValueOnce([]);

      const stats = await redisCache.getStats();

      expect(stats).toEqual({
        totalKeys: 3,
      });
    });

    it("should perform health check successfully", async () => {
      mockRedis.ping.mockResolvedValue("PONG");

      const isHealthy = await redisCache.healthCheck();

      expect(isHealthy).toBe(true);
      expect(mockRedis.ping).toHaveBeenCalled();
    });

    it("should handle health check failure", async () => {
      mockRedis.ping.mockRejectedValue(new Error("Connection failed"));

      const isHealthy = await redisCache.healthCheck();

      expect(isHealthy).toBe(false);
    });
  });

  describe("Error Handling", () => {
    it("should handle JSON parsing errors gracefully", async () => {
      mockRedis.get.mockResolvedValue("invalid-json");

      const result = await redisCache.getUploadSession("test-session-id");

      expect(result).toBeNull();
    });

    it("should handle Redis operation failures gracefully", async () => {
      mockRedis.setex.mockRejectedValue(new Error("Redis error"));

      const result = await redisCache.setUploadSession(
        "test-session-id",
        mockUploadSession
      );

      expect(result).toBe(false);
    });

    it("should return false when Redis is not available", async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      const cacheWithoutRedis = new RedisCache();

      const result = await cacheWithoutRedis.setUploadSession(
        "test-session-id",
        mockUploadSession
      );

      expect(result).toBe(false);
    });
  });
});
