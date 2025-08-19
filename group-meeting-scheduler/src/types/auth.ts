/**
 * Authentication result from OAuth providers
 */
export interface AuthResult {
  success: boolean;
  token?: string;
  refreshToken?: string;
  expiresAt?: Date;
  error?: string;
  userInfo?: {
    id: string;
    email: string;
    name: string;
  };
}

/**
 * Calendar integration service interface
 */
export interface CalendarIntegration {
  authenticate(provider: "google" | "outlook"): Promise<AuthResult>;
  fetchCalendarData(
    token: string,
    dateRange: import("./calendar").DateRange
  ): Promise<import("./calendar").CalendarEvent[]>;
  createCalendarEvent(
    token: string,
    event: import("./calendar").CalendarEvent
  ): Promise<string>;
}

/**
 * OAuth provider configuration
 */
export interface OAuthProvider {
  id: "google" | "microsoft";
  name: string;
  clientId: string;
  clientSecret: string;
  scope: string[];
  authorizationUrl: string;
  tokenUrl: string;
}
