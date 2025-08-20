import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import {
  createUploadSession,
  addUploadedFileToSession,
  addParticipantToSession,
  type UploadedFile,
} from "@/lib/upload-session";
import {
  validateFile,
  validateICalContent,
  generateSafeFilename,
} from "@/lib/file-validation";
import { ICalParser } from "@/lib/ical-parser";
import { processCalendarData } from "@/lib/calendar-processor";
import { ErrorResponse, FileUploadResponse } from "@/types/api";
import { ParticipantCalendar } from "@/types/calendar";

/**
 * POST /api/calendars/upload
 * Handle iCal file uploads with validation and temporary storage
 */
export async function POST(request: NextRequest) {
  const requestId = uuidv4();

  try {
    // Check if Vercel Blob is configured
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: "BLOB_NOT_CONFIGURED",
            message: "File storage is not configured",
            suggestions: [
              "Contact administrator to configure Vercel Blob storage",
            ],
          },
          timestamp: new Date().toISOString(),
          requestId,
        },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: "NO_FILES",
            message: "No files provided",
            suggestions: ["Please select at least one iCal file to upload"],
          },
          timestamp: new Date().toISOString(),
          requestId,
        },
        { status: 400 }
      );
    }

    // Create a new upload session
    const session = createUploadSession();
    const uploadErrors: string[] = [];
    const participants: ParticipantCalendar[] = [];
    let earliestDate: Date | null = null;
    let latestDate: Date | null = null;

    // Process each file
    for (const file of files) {
      let uploadedFile: UploadedFile | null = null;

      try {
        // Validate file
        const validation = validateFile(file);
        if (!validation.isValid) {
          uploadErrors.push(`${file.name}: ${validation.errors.join(", ")}`);

          // Create failed file record
          uploadedFile = {
            id: uuidv4(),
            originalName: file.name,
            blobUrl: "",
            size: file.size,
            uploadedAt: new Date(),
            processed: false,
            errors: validation.errors,
          };
          addUploadedFileToSession(session.id, uploadedFile);
          continue;
        }

        // Read file content
        const content = await file.text();

        // Validate iCal content
        const contentValidation = validateICalContent(content);
        if (!contentValidation.isValid) {
          uploadErrors.push(
            `${file.name}: ${contentValidation.errors.join(", ")}`
          );

          // Create failed file record
          uploadedFile = {
            id: uuidv4(),
            originalName: file.name,
            blobUrl: "",
            size: file.size,
            uploadedAt: new Date(),
            processed: false,
            errors: contentValidation.errors,
          };
          addUploadedFileToSession(session.id, uploadedFile);
          continue;
        }

        // Generate safe filename for blob storage
        const safeFilename = generateSafeFilename(file.name);
        const blobFilename = `uploads/${
          session.id
        }/${uuidv4()}-${safeFilename}`;

        // Upload to Vercel Blob
        const blob = await put(blobFilename, content, {
          access: "public",
          contentType: "text/calendar",
        });

        // Create uploaded file record
        uploadedFile = {
          id: uuidv4(),
          originalName: file.name,
          blobUrl: blob.url,
          size: file.size,
          uploadedAt: new Date(),
          processed: false,
        };

        // Add file to session
        addUploadedFileToSession(session.id, uploadedFile);

        // Parse iCal content
        try {
          const participant = ICalParser.parseICalContent(
            content,
            file.name.replace(/\.(ics|ical)$/i, "")
          );

          participants.push(participant);
          addParticipantToSession(session.id, participant);

          // Update date range
          if (participant.events.length > 0) {
            const eventDates = participant.events.flatMap((e) => [
              e.start,
              e.end,
            ]);
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

          // Mark file as processed
          uploadedFile.processed = true;
        } catch (parseError) {
          const errorMessage =
            parseError instanceof Error
              ? parseError.message
              : "Unknown parsing error";
          uploadErrors.push(
            `${file.name}: Failed to parse calendar data - ${errorMessage}`
          );
          uploadedFile.errors = [errorMessage];
        }
      } catch (fileError) {
        const errorMessage =
          fileError instanceof Error
            ? fileError.message
            : "Unknown file processing error";
        uploadErrors.push(`${file.name}: ${errorMessage}`);
      }
    }

    // Check if any files were successfully processed
    if (participants.length === 0) {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: "NO_VALID_FILES",
            message: "No valid calendar files could be processed",
            details: { errors: uploadErrors },
            suggestions: [
              "Ensure files are valid iCal (.ics) format",
              "Check that files contain calendar events",
              "Verify files are not corrupted",
            ],
          },
          timestamp: new Date().toISOString(),
          requestId,
        },
        { status: 400 }
      );
    }

    // Prepare response
    const response: FileUploadResponse = {
      sessionId: session.id,
      participantCount: participants.length,
      dateRange: {
        start: earliestDate?.toISOString() || new Date().toISOString(),
        end: latestDate?.toISOString() || new Date().toISOString(),
      },
      errors: uploadErrors.length > 0 ? uploadErrors : undefined,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("File upload error:", error);

    return NextResponse.json<ErrorResponse>(
      {
        error: {
          code: "UPLOAD_FAILED",
          message: "Failed to process file upload",
          details: {
            error: error instanceof Error ? error.message : "Unknown error",
          },
          suggestions: [
            "Try uploading files again",
            "Ensure files are valid iCal format",
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
 * GET /api/calendars/upload
 * Get upload endpoint information
 */
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/calendars/upload",
    method: "POST",
    contentType: "multipart/form-data",
    maxFileSize: "5MB",
    allowedExtensions: [".ics", ".ical"],
    allowedMimeTypes: [
      "text/calendar",
      "application/octet-stream",
      "text/plain",
    ],
  });
}
