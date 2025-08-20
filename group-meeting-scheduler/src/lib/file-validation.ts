/**
 * File validation utilities for iCal uploads
 */

export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Maximum file size (5MB)
 */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Allowed MIME types for iCal files
 */
export const ALLOWED_MIME_TYPES = [
  "text/calendar",
  "application/octet-stream", // Some browsers send this for .ics files
  "text/plain", // Fallback for .ics files
];

/**
 * Allowed file extensions
 */
export const ALLOWED_EXTENSIONS = [".ics", ".ical"];

/**
 * Validate file before processing
 */
export function validateFile(file: File): FileValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    errors.push(
      `File size (${formatFileSize(
        file.size
      )}) exceeds maximum allowed size (${formatFileSize(MAX_FILE_SIZE)})`
    );
  }

  if (file.size === 0) {
    errors.push("File is empty");
  }

  // Check file extension
  const fileName = file.name.toLowerCase();
  const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) =>
    fileName.endsWith(ext)
  );

  if (!hasValidExtension) {
    errors.push(
      `Invalid file extension. Allowed extensions: ${ALLOWED_EXTENSIONS.join(
        ", "
      )}`
    );
  }

  // Check MIME type (with warning for common mismatches)
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    if (hasValidExtension) {
      warnings.push(
        `Unexpected MIME type "${file.type}" for iCal file. Will attempt to process anyway.`
      );
    } else {
      errors.push(
        `Invalid file type "${file.type}". Expected: ${ALLOWED_MIME_TYPES.join(
          ", "
        )}`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate iCal content
 */
export function validateICalContent(content: string): FileValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if content is empty
  if (!content.trim()) {
    errors.push("File content is empty");
    return { isValid: false, errors, warnings };
  }

  // Check for basic iCal structure
  if (!content.includes("BEGIN:VCALENDAR")) {
    errors.push("Invalid iCal format: Missing BEGIN:VCALENDAR");
  }

  if (!content.includes("END:VCALENDAR")) {
    errors.push("Invalid iCal format: Missing END:VCALENDAR");
  }

  // Check for version
  if (!content.includes("VERSION:")) {
    warnings.push("iCal version not specified");
  }

  // Check for PRODID
  if (!content.includes("PRODID:")) {
    warnings.push("iCal PRODID not specified");
  }

  // Check for events
  if (!content.includes("BEGIN:VEVENT")) {
    warnings.push("No events found in calendar file");
  }

  // Check for common encoding issues
  if (content.includes("�")) {
    warnings.push("File may contain encoding issues that could affect parsing");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Generate a safe filename
 */
export function generateSafeFilename(originalName: string): string {
  // Remove path separators and other potentially dangerous characters
  const safeName = originalName
    .replace(/[^a-zA-Z0-9.-]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");

  // Ensure it has a valid extension
  if (!ALLOWED_EXTENSIONS.some((ext) => safeName.toLowerCase().endsWith(ext))) {
    return safeName + ".ics";
  }

  return safeName;
}
