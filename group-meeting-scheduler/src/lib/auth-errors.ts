export type AuthError =
  | "Configuration"
  | "AccessDenied"
  | "Verification"
  | "Default"
  | "RefreshAccessTokenError"
  | "OAuthSignin"
  | "OAuthCallback"
  | "OAuthCreateAccount"
  | "EmailCreateAccount"
  | "Callback"
  | "OAuthAccountNotLinked"
  | "EmailSignin"
  | "CredentialsSignin"
  | "SessionRequired";

export interface AuthErrorInfo {
  title: string;
  description: string;
  action?: string;
}

export function getAuthErrorInfo(error: AuthError): AuthErrorInfo {
  switch (error) {
    case "Configuration":
      return {
        title: "Server Configuration Error",
        description:
          "There is a problem with the server configuration. Please contact support.",
      };
    case "AccessDenied":
      return {
        title: "Access Denied",
        description: "You do not have permission to sign in.",
        action: "Please contact your administrator for access.",
      };
    case "Verification":
      return {
        title: "Verification Error",
        description:
          "The verification token has expired or has already been used.",
        action: "Please try signing in again.",
      };
    case "RefreshAccessTokenError":
      return {
        title: "Session Expired",
        description: "Your session has expired and could not be refreshed.",
        action: "Please sign in again to continue.",
      };
    case "OAuthSignin":
      return {
        title: "OAuth Sign-in Error",
        description: "There was an error during the OAuth sign-in process.",
        action: "Please try again or use a different provider.",
      };
    case "OAuthCallback":
      return {
        title: "OAuth Callback Error",
        description: "There was an error processing the OAuth callback.",
        action: "Please try signing in again.",
      };
    case "OAuthCreateAccount":
      return {
        title: "Account Creation Error",
        description: "Could not create an account with the OAuth provider.",
        action: "Please try again or contact support.",
      };
    case "OAuthAccountNotLinked":
      return {
        title: "Account Not Linked",
        description: "This account is not linked to your existing account.",
        action:
          "Please sign in with your original provider or contact support.",
      };
    case "SessionRequired":
      return {
        title: "Authentication Required",
        description: "You must be signed in to access this page.",
        action: "Please sign in to continue.",
      };
    default:
      return {
        title: "Authentication Error",
        description: "An unexpected error occurred during authentication.",
        action: "Please try again or contact support if the problem persists.",
      };
  }
}

export function isRetryableError(error: AuthError): boolean {
  const retryableErrors: AuthError[] = [
    "OAuthSignin",
    "OAuthCallback",
    "Verification",
    "RefreshAccessTokenError",
  ];
  return retryableErrors.includes(error);
}
