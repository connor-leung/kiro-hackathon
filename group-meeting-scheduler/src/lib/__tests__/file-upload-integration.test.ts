import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { POST } from "@/app/api/calendars/upload/route";
import {
  GET as getSession,
  DELETE as deleteSession,
} from "@/app/api/calendars/[sessionId]/route";
import { NextRequest } from "next/server";

// Mock Vercel Blob
vi.mock("@vercel/blob", () => ({
  put: vi.fn().mockResolvedValue({
    url: "https://blob.vercel-storage.com/test-file.ics",
    pathname: "test-file.ics",
    contentType: "text/calendar",
    contentDisposition: 'attachment; filename="test-file.ics"',
  }),
}));

// Mock UUID to return predictable values
let uuidCounter = 0;
vi.mock("uuid", () => ({
  v4: vi.fn(() => `test-uuid-${++uuidCounter}`),
}));

const originalEnv = process.env;

describe("File Upload Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidCounter = 0;
    process.env = {
      ...originalEnv,
      BLOB_READ_WRITE_TOKEN: "test-token",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should handle complete upload, retrieve, and delete workflow", async () => {
    // Step 1: Upload a valid iCal file
    const validICalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:meeting-1
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
SUMMARY:Team Meeting
DESCRIPTION:Weekly team sync
LOCATION:Conference Room A
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
UID:meeting-2
DTSTART:20240116T140000Z
DTEND:20240116T150000Z
SUMMARY:Client Call
STATUS:TENTATIVE
END:VEVENT
END:VCALENDAR`;

    const file = new File([validICalContent], "team-calendar.ics", {
      type: "text/calendar",
    });

    const formData = new FormData();
    formData.append("files", file);

    const uploadRequest = new NextRequest(
      "http://localhost:3000/api/calendars/upload",
      {
        method: "POST",
        body: formData,
      }
    );

    const uploadResponse = await POST(uploadRequest);
    const uploadData = await uploadResponse.json();

    // Verify upload response
    expect(uploadResponse.status).toBe(201);
    expect(uploadData.sessionId).toMatch(/^test-uuid-\d+$/);
    expect(uploadData.participantCount).toBe(1);
    expect(uploadData.dateRange).toBeDefined();
    expect(uploadData.dateRange.start).toBe("2024-01-15T10:00:00.000Z");
    expect(uploadData.dateRange.end).toBe("2024-01-16T15:00:00.000Z");

    // Step 2: Retrieve the session data
    const sessionId = uploadData.sessionId;
    const getRequest = new NextRequest(
      `http://localhost:3000/api/calendars/${sessionId}`
    );
    const getParams = Promise.resolve({ sessionId });

    const getResponse = await getSession(getRequest, { params: getParams });
    const sessionData = await getResponse.json();

    // Verify session data
    expect(getResponse.status).toBe(200);
    expect(sessionData.sessionId).toBe(sessionId);
    expect(sessionData.participantCount).toBe(1);
    expect(sessionData.participants).toHaveLength(1);

    const participant = sessionData.participants[0];
    expect(participant.name).toBe("team-calendar");
    expect(participant.eventCount).toBe(2);
    expect(participant.source).toBe("ical");
    expect(participant.dateRange).toBeDefined();

    expect(sessionData.uploadedFiles).toHaveLength(1);
    const uploadedFile = sessionData.uploadedFiles[0];
    expect(uploadedFile.originalName).toBe("team-calendar.ics");
    expect(uploadedFile.processed).toBe(true);
    expect(uploadedFile.errors).toBeUndefined();

    // Step 3: Delete the session
    const deleteRequest = new NextRequest(
      `http://localhost:3000/api/calendars/${sessionId}`
    );
    const deleteParams = Promise.resolve({ sessionId });

    const deleteResponse = await deleteSession(deleteRequest, {
      params: deleteParams,
    });
    const deleteData = await deleteResponse.json();

    // Verify deletion
    expect(deleteResponse.status).toBe(200);
    expect(deleteData.message).toBe("Session deleted successfully");
    expect(deleteData.sessionId).toBe(sessionId);

    // Step 4: Verify session is no longer accessible
    const getAfterDeleteResponse = await getSession(getRequest, {
      params: getParams,
    });
    const getAfterDeleteData = await getAfterDeleteResponse.json();

    expect(getAfterDeleteResponse.status).toBe(404);
    expect(getAfterDeleteData.error.code).toBe("SESSION_NOT_FOUND");
  });

  it("should handle multiple files with mixed success/failure", async () => {
    const validICalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:valid-event
DTSTART:20240120T090000Z
DTEND:20240120T100000Z
SUMMARY:Valid Meeting
END:VEVENT
END:VCALENDAR`;

    const invalidICalContent = `This is not a valid iCal file`;

    const validFile = new File([validICalContent], "valid-calendar.ics", {
      type: "text/calendar",
    });

    const invalidFile = new File([invalidICalContent], "invalid-calendar.ics", {
      type: "text/calendar",
    });

    const formData = new FormData();
    formData.append("files", validFile);
    formData.append("files", invalidFile);

    const uploadRequest = new NextRequest(
      "http://localhost:3000/api/calendars/upload",
      {
        method: "POST",
        body: formData,
      }
    );

    const uploadResponse = await POST(uploadRequest);
    const uploadData = await uploadResponse.json();

    // Should succeed with partial results
    expect(uploadResponse.status).toBe(201);
    expect(uploadData.sessionId).toBeDefined();
    expect(uploadData.participantCount).toBe(1); // Only valid file processed
    expect(uploadData.errors).toBeDefined();
    expect(uploadData.errors).toHaveLength(1);
    expect(uploadData.errors[0]).toContain("invalid-calendar.ics");

    // Retrieve session to verify details
    const sessionId = uploadData.sessionId;
    const getRequest = new NextRequest(
      `http://localhost:3000/api/calendars/${sessionId}`
    );
    const getParams = Promise.resolve({ sessionId });

    const getResponse = await getSession(getRequest, { params: getParams });
    const sessionData = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(sessionData.participants).toHaveLength(1);
    expect(sessionData.uploadedFiles).toHaveLength(2);

    // Check that one file was processed successfully and one failed
    const processedFiles = sessionData.uploadedFiles.filter(
      (f: any) => f.processed
    );
    const failedFiles = sessionData.uploadedFiles.filter((f: any) => f.errors);

    expect(processedFiles).toHaveLength(1);
    expect(failedFiles).toHaveLength(1);
    expect(failedFiles[0].originalName).toBe("invalid-calendar.ics");
  });

  it("should handle complex iCal with recurring events", async () => {
    const complexICalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
DTSTART:20070311T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
DTSTART:20071104T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:recurring-meeting-1
DTSTART;TZID=America/New_York:20240201T100000
DTEND;TZID=America/New_York:20240201T110000
SUMMARY:Weekly Standup
DESCRIPTION:Team standup meeting
RRULE:FREQ=WEEKLY;BYDAY=TH;COUNT=10
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
UID:one-time-meeting
DTSTART;TZID=America/New_York:20240205T140000
DTEND;TZID=America/New_York:20240205T150000
SUMMARY:Project Review
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

    const file = new File([complexICalContent], "complex-calendar.ics", {
      type: "text/calendar",
    });

    const formData = new FormData();
    formData.append("files", file);

    const uploadRequest = new NextRequest(
      "http://localhost:3000/api/calendars/upload",
      {
        method: "POST",
        body: formData,
      }
    );

    const uploadResponse = await POST(uploadRequest);
    const uploadData = await uploadResponse.json();

    expect(uploadResponse.status).toBe(201);
    expect(uploadData.participantCount).toBe(1);

    // Retrieve and verify the parsed data
    const sessionId = uploadData.sessionId;
    const getRequest = new NextRequest(
      `http://localhost:3000/api/calendars/${sessionId}`
    );
    const getParams = Promise.resolve({ sessionId });

    const getResponse = await getSession(getRequest, { params: getParams });
    const sessionData = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(sessionData.participants).toHaveLength(1);

    const participant = sessionData.participants[0];
    expect(participant.name).toBe("complex-calendar");
    expect(participant.eventCount).toBe(2); // Base events (recurring rules will be expanded later)
    expect(participant.timezone).toBe("America/New_York");
  });
});
