import { v4 as uuidv4 } from "uuid";
import { ParticipantCalendar } from "@/types/calendar";

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
 * In-memory session storage (in production, this would be Redis)
 * For now, using Map for development/testing
 */
const sessions = new Map<string, UploadSession>();

/**
 * Create a new upload session
 */
export function createUploadSession(): UploadSession {
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

  sessions.set(sessionId, session);
  return session;
}

/**
 * Get an upload session by ID
 */
export function getUploadSession(sessionId: string): UploadSession | null {
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
export function updateUploadSession(
  sessionId: string,
  updates: Partial<UploadSession>
): UploadSession | null {
  const session = getUploadSession(sessionId);

  if (!session) {
    return null;
  }

  const updatedSession = { ...session, ...updates };
  sessions.set(sessionId, updatedSession);
  return updatedSession;
}

/**
 * Add a participant to a session
 */
export function addParticipantToSession(
  sessionId: string,
  participant: ParticipantCalendar
): UploadSession | null {
  const session = getUploadSession(sessionId);

  if (!session) {
    return null;
  }

  session.participants.push(participant);
  sessions.set(sessionId, session);
  return session;
}

/**
 * Add an uploaded file to a session
 */
export function addUploadedFileToSession(
  sessionId: string,
  file: UploadedFile
): UploadSession | null {
  const session = getUploadSession(sessionId);

  if (!session) {
    return null;
  }

  session.uploadedFiles.push(file);
  sessions.set(sessionId, session);
  return session;
}

/**
 * Delete an upload session
 */
export function deleteUploadSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
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
