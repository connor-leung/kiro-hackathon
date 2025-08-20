import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getUploadSession } from "@/lib/upload-session";
import { MeetingScheduler } from "@/lib/meeting-scheduler";
import { redisCache } from "@/lib/redis-cache";
import {
  ErrorResponse,
  MeetingAnalysisRequest,
  MeetingAnalysisResponse,
} from "@/types/api";
import { MeetingPreferences } from "@/types/scheduling";
import { addDays, startOfDay, endOfDay } from "date-fns";

/**
 * POST /api/meetings/analyze
 * Analyze calendars and find optimal meeting times
 */
export async function POST(request: NextRequest) {
  const requestId = uuidv4();
  const startTime = Date.now();

  try {
    const body: MeetingAnalysisRequest = await request.json();
    const { sessionId, preferences } = body;

    // Validate request body
    if (!sessionId || !preferences) {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Missing required fields: sessionId and preferences",
            suggestions: [
              "Ensure sessionId is provided",
              "Ensure preferences object is provided with duration, timeRangeStart, timeRangeEnd",
            ],
          },
          timestamp: new Date().toISOString(),
          requestId,
        },
        { status: 400 }
      );
    }

    // Validate preferences
    const validationError = validateMeetingPreferences(preferences);
    if (validationError) {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: "INVALID_PREFERENCES",
            message: validationError,
            suggestions: [
              "Check that duration is a positive number",
              "Ensure time ranges are in HH:MM format",
              "Verify that timeRangeStart is before timeRangeEnd",
            ],
          },
          timestamp: new Date().toISOString(),
          requestId,
        },
        { status: 400 }
      );
    }

    // Get session data
    const session = await getUploadSession(sessionId);
    if (!session) {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: "SESSION_NOT_FOUND",
            message: "Upload session not found or expired",
            suggestions: [
              "Check that the session ID is correct",
              "Upload your files again if the session has expired",
              "Sessions expire after 24 hours",
            ],
          },
          timestamp: new Date().toISOString(),
          requestId,
        },
        { status: 404 }
      );
    }

    // Check if session has participants
    if (!session.participants || session.participants.length === 0) {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: "NO_PARTICIPANTS",
            message: "No participants found in session",
            suggestions: [
              "Upload calendar files first",
              "Ensure calendar files were processed successfully",
            ],
          },
          timestamp: new Date().toISOString(),
          requestId,
        },
        { status: 400 }
      );
    }

    // Determine search range based on calendar data
    const searchRange = calculateSearchRange(session.participants);
    if (!searchRange) {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: "NO_CALENDAR_DATA",
            message: "No calendar events found to analyze",
            suggestions: [
              "Ensure uploaded calendar files contain events",
              "Check that calendar files are not empty",
            ],
          },
          timestamp: new Date().toISOString(),
          requestId,
        },
        { status: 400 }
      );
    }

    // Initialize meeting scheduler
    const scheduler = new MeetingScheduler();

    // Perform scheduling analysis
    const results = await scheduler.scheduleOptimalMeeting(
      session.participants,
      preferences,
      searchRange
    );

    // Store scheduling session with results
    const schedulingSession: import("@/types/scheduling").SchedulingSession = {
      id: sessionId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      participants: session.participants,
      preferences,
      results,
    };

    // Store in Redis cache
    if (redisCache.isAvailable()) {
      await redisCache.setSchedulingSession(sessionId, schedulingSession);
    }

    const processingTime = Date.now() - startTime;

    const response: MeetingAnalysisResponse = {
      sessionId,
      results,
      processingTime,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Meeting analysis error:", error);

    // Handle specific scheduling errors
    if (error instanceof Error && error.name === "SchedulingError") {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: (error as any).code || "SCHEDULING_ERROR",
            message: error.message,
            suggestions: [
              "Try adjusting meeting preferences",
              "Consider expanding the time range",
              "Check if participants have availability",
            ],
          },
          timestamp: new Date().toISOString(),
          requestId,
        },
        { status: 400 }
      );
    }

    return NextResponse.json<ErrorResponse>(
      {
        error: {
          code: "ANALYSIS_FAILED",
          message: "Failed to analyze meeting availability",
          details: {
            error: error instanceof Error ? error.message : "Unknown error",
          },
          suggestions: [
            "Try the analysis again",
            "Check that all calendar data is valid",
            "Contact support if the problem persists",
          ],
        },
        timestamp: new Date().toISOString(),
        requestId,
      },
      { status: 500 }
    );
  }
}

/**
 * Validates meeting preferences
 */
function validateMeetingPreferences(
  preferences: MeetingPreferences
): string | null {
  if (!preferences.duration || preferences.duration <= 0) {
    return "Duration must be a positive number";
  }

  if (preferences.duration > 8 * 60) {
    return "Duration cannot exceed 8 hours (480 minutes)";
  }

  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(preferences.timeRangeStart)) {
    return "timeRangeStart must be in HH:MM format";
  }

  if (!timeRegex.test(preferences.timeRangeEnd)) {
    return "timeRangeEnd must be in HH:MM format";
  }

  // Parse times to compare
  const [startHour, startMinute] = preferences.timeRangeStart
    .split(":")
    .map(Number);
  const [endHour, endMinute] = preferences.timeRangeEnd.split(":").map(Number);

  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  if (startMinutes >= endMinutes) {
    return "timeRangeStart must be before timeRangeEnd";
  }

  if (preferences.bufferTime < 0) {
    return "bufferTime cannot be negative";
  }

  if (preferences.bufferTime > 60) {
    return "bufferTime cannot exceed 60 minutes";
  }

  return null;
}

/**
 * Calculates appropriate search range based on participant calendar data
 */
function calculateSearchRange(
  participants: import("@/types/calendar").ParticipantCalendar[]
): { start: Date; end: Date } | null {
  let earliestDate: Date | null = null;
  let latestDate: Date | null = null;

  // Find the date range from all participants' events
  for (const participant of participants) {
    if (participant.events.length > 0) {
      const eventDates = participant.events.flatMap((e) => [e.start, e.end]);
      const minDate = new Date(Math.min(...eventDates.map((d) => d.getTime())));
      const maxDate = new Date(Math.max(...eventDates.map((d) => d.getTime())));

      if (!earliestDate || minDate < earliestDate) {
        earliestDate = minDate;
      }
      if (!latestDate || maxDate > latestDate) {
        latestDate = maxDate;
      }
    }
  }

  if (!earliestDate || !latestDate) {
    return null;
  }

  // Extend the search range to include some buffer
  // Start from today or the earliest event date, whichever is later
  const today = startOfDay(new Date());
  const searchStart = earliestDate > today ? startOfDay(earliestDate) : today;

  // End 30 days from start or at the latest event date, whichever is later
  const defaultEnd = addDays(searchStart, 30);
  const searchEnd =
    latestDate > defaultEnd ? endOfDay(latestDate) : endOfDay(defaultEnd);

  return {
    start: searchStart,
    end: searchEnd,
  };
}
