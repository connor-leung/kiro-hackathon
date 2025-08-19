/**
 * Meeting preferences and constraints for scheduling
 */
export interface MeetingPreferences {
  duration: number; // minutes
  timeRangeStart: string; // "09:00"
  timeRangeEnd: string; // "17:00"
  excludeWeekends: boolean;
  excludedDates: Date[];
  bufferTime: number; // minutes
  preferredTimezones: string[];
}

/**
 * Available time slot with scoring and timezone display
 */
export interface TimeSlot {
  start: Date;
  end: Date;
  score: number; // 0-100 based on preferences
  conflicts: string[]; // participant IDs with conflicts
  timezoneDisplay: Record<string, string>; // timezone -> formatted time
}

/**
 * Summary of scheduling conflicts
 */
export interface ConflictSummary {
  totalConflicts: number;
  participantConflicts: Record<string, number>;
  conflictsByTimeSlot: Record<string, string[]>;
}

/**
 * Complete scheduling analysis result
 */
export interface SchedulingResult {
  availableSlots: TimeSlot[];
  conflictAnalysis: ConflictSummary;
  recommendations: TimeSlot[];
}

/**
 * Scheduling session data stored in cache
 */
export interface SchedulingSession {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  participants: import("./calendar").ParticipantCalendar[];
  preferences: MeetingPreferences;
  results?: SchedulingResult;
}
