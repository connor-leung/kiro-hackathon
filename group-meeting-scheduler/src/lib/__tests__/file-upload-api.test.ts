import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { POST, GET } from "@/app/api/calendars/upload/route";
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

// Mock UUID
vi.mock("uuid", () => ({
  v4: vi.fn(() => "test-uuid-123"),
}));

// Mock environment variables
const originalEnv = process.env;

describe("File Upload API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      BLOB_READ_WRITE_TOKEN: "test-token",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("POST /api/calendars/upload", () => {
    it("should return endpoint info for GET request", async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
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
    });

    it("should return error when Vercel Blob is not configured", async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN;

      const formData = new FormData();
      const request = new NextRequest(
        "http://localhost:3000/api/calendars/upload",
        {
          method: "POST",
          body: formData,
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error.code).toBe("BLOB_NOT_CONFIGURED");
    });

    it("should return error when no files are provided", async () => {
      const formData = new FormData();
      const request = new NextRequest(
        "http://localhost:3000/api/calendars/upload",
        {
          method: "POST",
          body: formData,
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("NO_FILES");
    });

    it("should successfully process valid iCal files", async () => {
      const validICalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event-1
DTSTART:20240101T100000Z
DTEND:20240101T110000Z
SUMMARY:Test Meeting
END:VEVENT
END:VCALENDAR`;

      const file = new File([validICalContent], "test-calendar.ics", {
        type: "text/calendar",
      });

      const formData = new FormData();
      formData.append("files", file);

      const request = new NextRequest(
        "http://localhost:3000/api/calendars/upload",
        {
          method: "POST",
          body: formData,
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.sessionId).toBe("test-uuid-123");
      expect(data.participantCount).toBe(1);
      expect(data.dateRange).toBeDefined();
    });

    it("should handle invalid file extensions", async () => {
      const file = new File(["invalid content"], "test.txt", {
        type: "text/plain",
      });

      const formData = new FormData();
      formData.append("files", file);

      const request = new NextRequest(
        "http://localhost:3000/api/calendars/upload",
        {
          method: "POST",
          body: formData,
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("NO_VALID_FILES");
      expect(data.error.details.errors).toContain(
        "test.txt: Invalid file extension. Allowed extensions: .ics, .ical"
      );
    });

    it("should handle files that are too large", async () => {
      const largeContent = "x".repeat(6 * 1024 * 1024); // 6MB
      const file = new File([largeContent], "large-calendar.ics", {
        type: "text/calendar",
      });

      const formData = new FormData();
      formData.append("files", file);

      const request = new NextRequest(
        "http://localhost:3000/api/calendars/upload",
        {
          method: "POST",
          body: formData,
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("NO_VALID_FILES");
      expect(data.error.details.errors[0]).toContain(
        "exceeds maximum allowed size"
      );
    });

    it("should handle empty files", async () => {
      const file = new File([""], "empty-calendar.ics", {
        type: "text/calendar",
      });

      const formData = new FormData();
      formData.append("files", file);

      const request = new NextRequest(
        "http://localhost:3000/api/calendars/upload",
        {
          method: "POST",
          body: formData,
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("NO_VALID_FILES");
      expect(data.error.details.errors[0]).toContain("File is empty");
    });

    it("should handle invalid iCal content", async () => {
      const invalidContent = "This is not a valid iCal file";
      const file = new File([invalidContent], "invalid.ics", {
        type: "text/calendar",
      });

      const formData = new FormData();
      formData.append("files", file);

      const request = new NextRequest(
        "http://localhost:3000/api/calendars/upload",
        {
          method: "POST",
          body: formData,
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("NO_VALID_FILES");
      expect(data.error.details.errors[0]).toContain("Invalid iCal format");
    });

    it("should process multiple valid files", async () => {
      const iCalContent1 = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event-1
DTSTART:20240101T100000Z
DTEND:20240101T110000Z
SUMMARY:Meeting 1
END:VEVENT
END:VCALENDAR`;

      const iCalContent2 = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event-2
DTSTART:20240102T140000Z
DTEND:20240102T150000Z
SUMMARY:Meeting 2
END:VEVENT
END:VCALENDAR`;

      const file1 = new File([iCalContent1], "calendar1.ics", {
        type: "text/calendar",
      });
      const file2 = new File([iCalContent2], "calendar2.ics", {
        type: "text/calendar",
      });

      const formData = new FormData();
      formData.append("files", file1);
      formData.append("files", file2);

      const request = new NextRequest(
        "http://localhost:3000/api/calendars/upload",
        {
          method: "POST",
          body: formData,
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.participantCount).toBe(2);
    });
  });

  describe("GET /api/calendars/[sessionId]", () => {
    it("should return session not found for invalid session ID", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/calendars/invalid-session"
      );
      const params = Promise.resolve({ sessionId: "invalid-session" });

      const response = await getSession(request, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe("SESSION_NOT_FOUND");
    });
  });

  describe("DELETE /api/calendars/[sessionId]", () => {
    it("should return session not found for invalid session ID", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/calendars/invalid-session"
      );
      const params = Promise.resolve({ sessionId: "invalid-session" });

      const response = await deleteSession(request, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe("SESSION_NOT_FOUND");
    });
  });
});

describe("File Validation", () => {
  it("should validate file extensions correctly", async () => {
    const { validateFile } = await import("@/lib/file-validation");

    const validFile = new File(["content"], "test.ics", {
      type: "text/calendar",
    });
    const invalidFile = new File(["content"], "test.txt", {
      type: "text/plain",
    });

    const validResult = validateFile(validFile);
    const invalidResult = validateFile(invalidFile);

    expect(validResult.isValid).toBe(true);
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.errors[0]).toContain("Invalid file extension");
  });

  it("should validate iCal content correctly", async () => {
    const { validateICalContent } = await import("@/lib/file-validation");

    const validContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event
DTSTART:20240101T100000Z
DTEND:20240101T110000Z
SUMMARY:Test Event
END:VEVENT
END:VCALENDAR`;

    const invalidContent = "Not a valid iCal file";

    const validResult = validateICalContent(validContent);
    const invalidResult = validateICalContent(invalidContent);

    expect(validResult.isValid).toBe(true);
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.errors[0]).toContain("Invalid iCal format");
  });
});

describe("Upload Session Management", () => {
  it("should create and retrieve upload sessions", async () => {
    const { createUploadSession, getUploadSession } = await import(
      "@/lib/upload-session"
    );

    const session = createUploadSession();
    const retrieved = getUploadSession(session.id);

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(session.id);
    expect(retrieved?.participants).toEqual([]);
    expect(retrieved?.uploadedFiles).toEqual([]);
  });

  it("should return null for non-existent sessions", async () => {
    const { getUploadSession } = await import("@/lib/upload-session");

    const result = getUploadSession("non-existent-id");
    expect(result).toBeNull();
  });

  it("should delete sessions correctly", async () => {
    const { createUploadSession, getUploadSession, deleteUploadSession } =
      await import("@/lib/upload-session");

    const session = createUploadSession();
    expect(getUploadSession(session.id)).toBeDefined();

    const deleted = deleteUploadSession(session.id);
    expect(deleted).toBe(true);
    expect(getUploadSession(session.id)).toBeNull();
  });
});
