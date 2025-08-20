import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getUploadSession, deleteUploadSession } from "@/lib/upload-session";
import { ErrorResponse } from "@/types/api";

/**
 * GET /api/calendars/[sessionId]
 * Retrieve processed calendar data for a session
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const requestId = uuidv4();
  const { sessionId } = await params;

  try {
    const session = getUploadSession(sessionId);

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

    // Calculate date range from participants
    let earliestDate: Date | null = null;
    let latestDate: Date | null = null;

    for (const participant of session.participants) {
      if (participant.events.length > 0) {
        const eventDates = participant.events.flatMap((e) => [e.start, e.end]);
        const minDate = new Date(
          Math.min(...eventDates.map((d) => d.getTime()))
        );
        const maxDate = new Date(
          Math.max(...eventDates.map((d) => d.getTime()))
        );

        if (!earliestDate || minDate < earliestDate) {
          earliestDate = minDate;
        }
        if (!latestDate || maxDate > latestDate) {
          latestDate = maxDate;
        }
      }
    }

    const response = {
      sessionId: session.id,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      participantCount: session.participants.length,
      participants: session.participants.map((p) => ({
        participantId: p.participantId,
        name: p.name,
        timezone: p.timezone,
        eventCount: p.events.length,
        source: p.source,
        dateRange:
          p.events.length > 0
            ? {
                start: new Date(
                  Math.min(...p.events.map((e) => e.start.getTime()))
                ).toISOString(),
                end: new Date(
                  Math.max(...p.events.map((e) => e.end.getTime()))
                ).toISOString(),
              }
            : null,
      })),
      dateRange:
        earliestDate && latestDate
          ? {
              start: earliestDate.toISOString(),
              end: latestDate.toISOString(),
            }
          : null,
      uploadedFiles: session.uploadedFiles.map((f) => ({
        id: f.id,
        originalName: f.originalName,
        size: f.size,
        uploadedAt: f.uploadedAt.toISOString(),
        processed: f.processed,
        errors: f.errors,
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Session retrieval error:", error);

    return NextResponse.json<ErrorResponse>(
      {
        error: {
          code: "SESSION_RETRIEVAL_FAILED",
          message: "Failed to retrieve session data",
          details: {
            error: error instanceof Error ? error.message : "Unknown error",
          },
          suggestions: [
            "Try the request again",
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
 * DELETE /api/calendars/[sessionId]
 * Clean up session data and associated files
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const requestId = uuidv4();
  const { sessionId } = await params;

  try {
    const session = getUploadSession(sessionId);

    if (!session) {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: "SESSION_NOT_FOUND",
            message: "Upload session not found or already expired",
            suggestions: [
              "Check that the session ID is correct",
              "Session may have already been cleaned up",
            ],
          },
          timestamp: new Date().toISOString(),
          requestId,
        },
        { status: 404 }
      );
    }

    // TODO: In production, also clean up Vercel Blob files
    // For now, just delete the session from memory
    const deleted = deleteUploadSession(sessionId);

    if (!deleted) {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: "SESSION_DELETE_FAILED",
            message: "Failed to delete session",
            suggestions: [
              "Try the request again",
              "Contact support if the problem persists",
            ],
          },
          timestamp: new Date().toISOString(),
          requestId,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Session deleted successfully",
      sessionId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Session deletion error:", error);

    return NextResponse.json<ErrorResponse>(
      {
        error: {
          code: "SESSION_DELETE_FAILED",
          message: "Failed to delete session",
          details: {
            error: error instanceof Error ? error.message : "Unknown error",
          },
          suggestions: [
            "Try the request again",
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
