import { describe, it, expect } from "vitest";
import {
  getAuthErrorInfo,
  isRetryableError,
  type AuthError,
} from "../auth-errors";

describe("Auth Error Utilities", () => {
  describe("getAuthErrorInfo", () => {
    it("should return correct info for Configuration error", () => {
      const result = getAuthErrorInfo("Configuration");
      expect(result.title).toBe("Server Configuration Error");
      expect(result.description).toContain("server configuration");
      expect(result.action).toBeUndefined();
    });

    it("should return correct info for AccessDenied error", () => {
      const result = getAuthErrorInfo("AccessDenied");
      expect(result.title).toBe("Access Denied");
      expect(result.description).toContain("permission");
      expect(result.action).toContain("administrator");
    });

    it("should return correct info for RefreshAccessTokenError", () => {
      const result = getAuthErrorInfo("RefreshAccessTokenError");
      expect(result.title).toBe("Session Expired");
      expect(result.description).toContain("expired");
      expect(result.action).toContain("sign in again");
    });

    it("should return correct info for OAuthSignin error", () => {
      const result = getAuthErrorInfo("OAuthSignin");
      expect(result.title).toBe("OAuth Sign-in Error");
      expect(result.description).toContain("OAuth");
      expect(result.action).toContain("try again");
    });

    it("should return correct info for SessionRequired error", () => {
      const result = getAuthErrorInfo("SessionRequired");
      expect(result.title).toBe("Authentication Required");
      expect(result.description).toContain("signed in");
      expect(result.action).toContain("sign in");
    });

    it("should return default info for unknown error", () => {
      const result = getAuthErrorInfo("UnknownError" as AuthError);
      expect(result.title).toBe("Authentication Error");
      expect(result.description).toContain("unexpected error");
      expect(result.action).toContain("try again");
    });
  });

  describe("isRetryableError", () => {
    it("should return true for retryable errors", () => {
      expect(isRetryableError("OAuthSignin")).toBe(true);
      expect(isRetryableError("OAuthCallback")).toBe(true);
      expect(isRetryableError("Verification")).toBe(true);
      expect(isRetryableError("RefreshAccessTokenError")).toBe(true);
    });

    it("should return false for non-retryable errors", () => {
      expect(isRetryableError("Configuration")).toBe(false);
      expect(isRetryableError("AccessDenied")).toBe(false);
      expect(isRetryableError("OAuthAccountNotLinked")).toBe(false);
    });
  });
});
