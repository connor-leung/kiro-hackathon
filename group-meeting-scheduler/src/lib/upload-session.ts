import { v4 as uuidv4 } from "uuid";
import { ParticipantCalendar } from "@/types/calendar";
import { redisCache } from "./redis-cache";

/**
 * Interface for upload session data
 */
export interface UploadSession {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  participants: ParticipantCalendar[];
  uploadedFiles: UploadedFile[];
}

/**
 * Interface for tracking uploaded files
 */
export interface UploadedFile {
  id: string;
  originalName: string;
  blobUrl: string;
  size: number;
  uploadedAt: Date;
  processed: boolean;
  errors?: string[];
}

/**
 * In-memory session storage (fallback when Redis is not available)
 */
const sessions = new Map<string, UploadSession>();

/**
 * Create a new upload session
 */
export async function createUploadSession(): Promise<UploadSession> {
  const sessionId = uuidv4();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

  const session: UploadSession = {
    id: sessionId,
    createdAt: now,
    expiresAt,
    participants: [],
    uploadedFiles: [],
  };

  // Try to store in Redis first, fallback to in-memory
  if (redisCache.isAvailable()) {
    const stored = await redisCache.setUploadSession(sessionId, session);
    if (!stored) {
      console.warn(
        "Failed to store session in Redis, using in-memory fallback"
      );
      sessions.set(sessionId, session);
    }
  } else {
    sessions.set(sessionId, session);
  }

  return session;
}

/**
 * Get an upload session by ID
 */
export async function getUploadSession(
  sessionId: string
): Promise<UploadSession | null> {
  // Try Redis first
  if (redisCache.isAvailable()) {
    const session = await redisCache.getUploadSession(sessionId);
    if (session) {
      // Check if session has expired
      if (new Date() > session.expiresAt) {
        await redisCache.deleteUploadSession(sessionId);
        return null;
      }
      return session;
    }
  }

  // Fallback to in-memory
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  // Check if session has expired
  if (new Date() > session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }

  return session;
}

/**
 * Update an upload session
 */
export async function updateUploadSession(
  sessionId: string,
  updates: Partial<UploadSession>
): Promise<UploadSession | null> {
  const session = await getUploadSession(sessionId);

  if (!session) {
    return null;
  }

  const updatedSession = { ...session, ...updates };

  // Update in Redis first, fallback to in-memory
  if (redisCache.isAvailable()) {
    const stored = await redisCache.setUploadSession(sessionId, updatedSession);
    if (!stored) {
      console.warn(
        "Failed to update session in Redis, using in-memory fallback"
      );
      sessions.set(sessionId, updatedSession);
    }
  } else {
    sessions.set(sessionId, updatedSession);
  }

  return updatedSession;
}

/**
 * Add a participant to a session
 */
export async function addParticipantToSession(
  sessionId: string,
  participant: ParticipantCalendar
): Promise<UploadSession | null> {
  const session = await getUploadSession(sessionId);

  if (!session) {
    return null;
  }

  session.participants.push(participant);

  // Update in Redis first, fallback to in-memory
  if (redisCache.isAvailable()) {
    const stored = await redisCache.setUploadSession(sessionId, session);
    if (!stored) {
      console.warn(
        "Failed to update session in Redis, using in-memory fallback"
      );
      sessions.set(sessionId, session);
    }
  } else {
    sessions.set(sessionId, session);
  }

  return session;
}

/**
 * Add an uploaded file to a session
 */
export async function addUploadedFileToSession(
  sessionId: string,
  file: UploadedFile
): Promise<UploadSession | null> {
  const session = await getUploadSession(sessionId);

  if (!session) {
    return null;
  }

  session.uploadedFiles.push(file);

  // Update in Redis first, fallback to in-memory
  if (redisCache.isAvailable()) {
    const stored = await redisCache.setUploadSession(sessionId, session);
    if (!stored) {
      console.warn(
        "Failed to update session in Redis, using in-memory fallback"
      );
      sessions.set(sessionId, session);
    }
  } else {
    sessions.set(sessionId, session);
  }

  return session;
}

/**
 * Delete an upload session
 */
export async function deleteUploadSession(sessionId: string): Promise<boolean> {
  let deleted = false;

  // Delete from Redis first
  if (redisCache.isAvailable()) {
    deleted = await redisCache.deleteUploadSession(sessionId);
  }

  // Also delete from in-memory (in case it exists there)
  const memoryDeleted = sessions.delete(sessionId);

  return deleted || memoryDeleted;
}

/**
 * Clean up expired sessions
 */
export function cleanupExpiredSessions(): number {
  const now = new Date();
  let cleanedCount = 0;

  for (const [sessionId, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      sessions.delete(sessionId);
      cleanedCount++;
    }
  }

  return cleanedCount;
}

/**
 * Get session statistics
 */
export function getSessionStats() {
  return {
    totalSessions: sessions.size,
    activeSessions: Array.from(sessions.values()).filter(
      (s) => new Date() <= s.expiresAt
    ).length,
  };
}
