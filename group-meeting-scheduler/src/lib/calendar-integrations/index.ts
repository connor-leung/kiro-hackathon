export { BaseCalendarIntegration } from "./base-integration";
export { GoogleCalendarIntegration } from "./google-calendar";
export { MicrosoftGraphIntegration } from "./microsoft-graph";
export { UnifiedCalendarIntegration } from "./unified-integration";

// Create a singleton instance for use throughout the application
export const calendarIntegration = new UnifiedCalendarIntegration();
