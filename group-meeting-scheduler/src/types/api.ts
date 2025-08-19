/**
 * Standard API error response format
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    suggestions?: string[];
  };
  timestamp: string;
  requestId: string;
}

/**
 * Standard API success response format
 */
export interface SuccessResponse<T = any> {
  data: T;
  timestamp: string;
  requestId: string;
}

/**
 * File upload response
 */
export interface FileUploadResponse {
  sessionId: string;
  participantCount: number;
  dateRange: {
    start: string;
    end: string;
  };
  errors?: string[];
}

/**
 * Calendar connection response
 */
export interface CalendarConnectionResponse {
  sessionId: string;
  provider: string;
  participantName: string;
  eventCount: number;
  dateRange: {
    start: string;
    end: string;
  };
}

/**
 * Meeting analysis request
 */
export interface MeetingAnalysisRequest {
  sessionId: string;
  preferences: import("./scheduling").MeetingPreferences;
}

/**
 * Meeting analysis response
 */
export interface MeetingAnalysisResponse {
  sessionId: string;
  results: import("./scheduling").SchedulingResult;
  processingTime: number;
}
