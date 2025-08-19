import { describe, it, expect, vi } from "vitest";
import { isTokenExpired, getProviderName } from "../session";

describe("Session Utilities", () => {
  describe("isTokenExpired", () => {
    it("should return true for undefined expiresAt", () => {
      expect(isTokenExpired(undefined)).toBe(true);
    });

    it("should return true for expired token", () => {
      const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      expect(isTokenExpired(pastTime)).toBe(true);
    });

    it("should return false for valid token", () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      expect(isTokenExpired(futureTime)).toBe(false);
    });

    it("should return true for token expiring now", () => {
      const nowTime = Math.floor(Date.now() / 1000);
      expect(isTokenExpired(nowTime)).toBe(true);
    });
  });

  describe("getProviderName", () => {
    it("should return Google for google provider", () => {
      expect(getProviderName("google")).toBe("Google");
    });

    it("should return Microsoft for azure-ad provider", () => {
      expect(getProviderName("azure-ad")).toBe("Microsoft");
    });

    it("should return the provider name as-is for unknown providers", () => {
      expect(getProviderName("unknown-provider")).toBe("unknown-provider");
    });
  });
});
