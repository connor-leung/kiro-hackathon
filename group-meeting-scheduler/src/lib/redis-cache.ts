import { Redis } from "@upstash/redis";
import { SchedulingSession } from "@/types/scheduling";
import { UploadSession } from "./upload-session";

/**
 * Redis client instance
 */
let redis: Redis | null = null;

/**
 * Initialize Redis client
 */
function getRedisClient(): Redis | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    console.warn("Redis not configured - falling back to in-memory storage");
    return null;
  }

  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }

  return redis;
}

/**
 * Cache key prefixes
 */
const CACHE_KEYS = {
  UPLOAD_SESSION: "upload_session:",
  SCHEDULING_SESSION: "scheduling_session:",
  MEETING_RESULTS: "meeting_results:",
} as const;

/**
 * Default expiration times (in seconds)
 */
const EXPIRATION = {
  UPLOAD_SESSION: 24 * 60 * 60, // 24 hours
  SCHEDULING_SESSION: 24 * 60 * 60, // 24 hours
  MEETING_RESULTS: 7 * 24 * 60 * 60, // 7 days
} as const;

/**
 * Redis cache service for session and meeting data
 */
export class RedisCache {
  private client: Redis | null;

  constructor() {
    this.client = getRedisClient();
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Store upload session data
   */
  async setUploadSession(
    sessionId: string,
    session: UploadSession
  ): Promise<boolean> {
    if (!this.client) return false;

    try {
      const key = `${CACHE_KEYS.UPLOAD_SESSION}${sessionId}`;
      const serializedSession = JSON.stringify({
        ...session,
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        participants: session.participants.map((p) => ({
          ...p,
          events: p.events.map((e) => ({
            ...e,
            start: e.start.toISOString(),
            end: e.end.toISOString(),
          })),
        })),
        uploadedFiles: session.uploadedFiles.map((f) => ({
          ...f,
          uploadedAt: f.uploadedAt.toISOString(),
        })),
      });

      await this.client.setex(
        key,
        EXPIRATION.UPLOAD_SESSION,
        serializedSession
      );
      return true;
    } catch (error) {
      console.error("Failed to store upload session in Redis:", error);
      return false;
    }
  }

  /**
   * Retrieve upload session data
   */
  async getUploadSession(sessionId: string): Promise<UploadSession | null> {
    if (!this.client) return null;

    try {
      const key = `${CACHE_KEYS.UPLOAD_SESSION}${sessionId}`;
      const data = await this.client.get(key);

      if (!data) return null;

      const parsed = JSON.parse(data as string);

      // Convert date strings back to Date objects
      return {
        ...parsed,
        createdAt: new Date(parsed.createdAt),
        expiresAt: new Date(parsed.expiresAt),
        participants: parsed.participants.map((p: any) => ({
          ...p,
          events: p.events.map((e: any) => ({
            ...e,
            start: new Date(e.start),
            end: new Date(e.end),
          })),
        })),
        uploadedFiles: parsed.uploadedFiles.map((f: any) => ({
          ...f,
          uploadedAt: new Date(f.uploadedAt),
        })),
      };
    } catch (error) {
      console.error("Failed to retrieve upload session from Redis:", error);
      return null;
    }
  }

  /**
   * Store scheduling session data
   */
  async setSchedulingSession(
    sessionId: string,
    session: SchedulingSession
  ): Promise<boolean> {
    if (!this.client) return false;

    try {
      const key = `${CACHE_KEYS.SCHEDULING_SESSION}${sessionId}`;
      const serializedSession = JSON.stringify({
        ...session,
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        participants: session.participants.map((p) => ({
          ...p,
          events: p.events.map((e) => ({
            ...e,
            start: e.start.toISOString(),
            end: e.end.toISOString(),
          })),
        })),
        preferences: {
          ...session.preferences,
          excludedDates: session.preferences.excludedDates.map((d) =>
            d.toISOString()
          ),
        },
        results: session.results
          ? {
              ...session.results,
              availableSlots: session.results.availableSlots.map((slot) => ({
                ...slot,
                start: slot.start.toISOString(),
                end: slot.end.toISOString(),
              })),
              recommendations: session.results.recommendations.map((slot) => ({
                ...slot,
                start: slot.start.toISOString(),
                end: slot.end.toISOString(),
              })),
            }
          : undefined,
      });

      await this.client.setex(
        key,
        EXPIRATION.SCHEDULING_SESSION,
        serializedSession
      );
      return true;
    } catch (error) {
      console.error("Failed to store scheduling session in Redis:", error);
      return false;
    }
  }

  /**
   * Retrieve scheduling session data
   */
  async getSchedulingSession(
    sessionId: string
  ): Promise<SchedulingSession | null> {
    if (!this.client) return null;

    try {
      const key = `${CACHE_KEYS.SCHEDULING_SESSION}${sessionId}`;
      const data = await this.client.get(key);

      if (!data) return null;

      const parsed = JSON.parse(data as string);

      // Convert date strings back to Date objects
      return {
        ...parsed,
        createdAt: new Date(parsed.createdAt),
        expiresAt: new Date(parsed.expiresAt),
        participants: parsed.participants.map((p: any) => ({
          ...p,
          events: p.events.map((e: any) => ({
            ...e,
            start: new Date(e.start),
            end: new Date(e.end),
          })),
        })),
        preferences: {
          ...parsed.preferences,
          excludedDates: parsed.preferences.excludedDates.map(
            (d: string) => new Date(d)
          ),
        },
        results: parsed.results
          ? {
              ...parsed.results,
              availableSlots: parsed.results.availableSlots.map(
                (slot: any) => ({
                  ...slot,
                  start: new Date(slot.start),
                  end: new Date(slot.end),
                })
              ),
              recommendations: parsed.results.recommendations.map(
                (slot: any) => ({
                  ...slot,
                  start: new Date(slot.start),
                  end: new Date(slot.end),
                })
              ),
            }
          : undefined,
      };
    } catch (error) {
      console.error("Failed to retrieve scheduling session from Redis:", error);
      return null;
    }
  }

  /**
   * Delete upload session
   */
  async deleteUploadSession(sessionId: string): Promise<boolean> {
    if (!this.client) return false;

    try {
      const key = `${CACHE_KEYS.UPLOAD_SESSION}${sessionId}`;
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      console.error("Failed to delete upload session from Redis:", error);
      return false;
    }
  }

  /**
   * Delete scheduling session
   */
  async deleteSchedulingSession(sessionId: string): Promise<boolean> {
    if (!this.client) return false;

    try {
      const key = `${CACHE_KEYS.SCHEDULING_SESSION}${sessionId}`;
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      console.error("Failed to delete scheduling session from Redis:", error);
      return false;
    }
  }

  /**
   * Update session expiration
   */
  async extendSessionExpiration(
    sessionId: string,
    type: "upload" | "scheduling"
  ): Promise<boolean> {
    if (!this.client) return false;

    try {
      const prefix =
        type === "upload"
          ? CACHE_KEYS.UPLOAD_SESSION
          : CACHE_KEYS.SCHEDULING_SESSION;
      const expiration =
        type === "upload"
          ? EXPIRATION.UPLOAD_SESSION
          : EXPIRATION.SCHEDULING_SESSION;
      const key = `${prefix}${sessionId}`;

      const result = await this.client.expire(key, expiration);
      return result === 1;
    } catch (error) {
      console.error("Failed to extend session expiration:", error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalKeys: number;
    memoryUsage?: string;
  } | null> {
    if (!this.client) return null;

    try {
      // Get keys matching our patterns
      const uploadKeys = await this.client.keys(
        `${CACHE_KEYS.UPLOAD_SESSION}*`
      );
      const schedulingKeys = await this.client.keys(
        `${CACHE_KEYS.SCHEDULING_SESSION}*`
      );
      const meetingKeys = await this.client.keys(
        `${CACHE_KEYS.MEETING_RESULTS}*`
      );

      return {
        totalKeys:
          uploadKeys.length + schedulingKeys.length + meetingKeys.length,
      };
    } catch (error) {
      console.error("Failed to get cache stats:", error);
      return null;
    }
  }

  /**
   * Health check for Redis connection
   */
  async healthCheck(): Promise<boolean> {
    if (!this.client) return false;

    try {
      const result = await this.client.ping();
      return result === "PONG";
    } catch (error) {
      console.error("Redis health check failed:", error);
      return false;
    }
  }
}

/**
 * Singleton instance
 */
export const redisCache = new RedisCache();
