import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock environment variables before importing auth
vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client-id");
vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-google-client-secret");
vi.stubEnv("MICROSOFT_CLIENT_ID", "test-microsoft-client-id");
vi.stubEnv("MICROSOFT_CLIENT_SECRET", "test-microsoft-client-secret");
vi.stubEnv("MICROSOFT_TENANT_ID", "test-tenant-id");
vi.stubEnv("NEXTAUTH_SECRET", "test-secret");

import { authOptions } from "../auth";

// Mock fetch
global.fetch = vi.fn();

describe("Auth Configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should have correct providers configured", () => {
    expect(authOptions.providers).toHaveLength(2);

    const googleProvider = authOptions.providers[0];
    const microsoftProvider = authOptions.providers[1];

    expect(googleProvider.id).toBe("google");
    expect(microsoftProvider.id).toBe("azure-ad");
  });

  it("should have correct session strategy", () => {
    expect(authOptions.session?.strategy).toBe("jwt");
  });

  it("should have correct pages configured", () => {
    expect(authOptions.pages?.signIn).toBe("/auth/signin");
    expect(authOptions.pages?.error).toBe("/auth/error");
  });
});

describe("JWT Callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should persist tokens on initial signin", async () => {
    const mockAccount = {
      access_token: "test-access-token",
      refresh_token: "test-refresh-token",
      provider: "google",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };

    const mockToken = {};

    const result = await authOptions.callbacks?.jwt?.({
      token: mockToken,
      account: mockAccount,
      user: null,
      profile: undefined,
      trigger: "signIn",
      isNewUser: false,
      session: null,
    });

    expect(result).toEqual({
      accessToken: "test-access-token",
      refreshToken: "test-refresh-token",
      provider: "google",
      expiresAt: mockAccount.expires_at,
    });
  });

  it("should return existing token if not expired", async () => {
    const mockToken = {
      accessToken: "existing-token",
      refreshToken: "existing-refresh-token",
      provider: "google",
      expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    };

    const result = await authOptions.callbacks?.jwt?.({
      token: mockToken,
      account: null,
      user: null,
      profile: undefined,
      trigger: "update",
      isNewUser: false,
      session: null,
    });

    expect(result).toEqual(mockToken);
  });

  it("should attempt to refresh expired Google token", async () => {
    const mockToken = {
      accessToken: "expired-token",
      refreshToken: "refresh-token",
      provider: "google",
      expiresAt: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    };

    const mockRefreshResponse = {
      access_token: "new-access-token",
      expires_in: 3600,
      refresh_token: "new-refresh-token",
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockRefreshResponse),
    });

    const result = await authOptions.callbacks?.jwt?.({
      token: mockToken,
      account: null,
      user: null,
      profile: undefined,
      trigger: "update",
      isNewUser: false,
      session: null,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      })
    );

    expect(result).toEqual({
      ...mockToken,
      accessToken: "new-access-token",
      expiresAt: expect.any(Number),
      refreshToken: "new-refresh-token",
    });
  });

  it("should attempt to refresh expired Microsoft token", async () => {
    const mockToken = {
      accessToken: "expired-token",
      refreshToken: "refresh-token",
      provider: "azure-ad",
      expiresAt: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    };

    const mockRefreshResponse = {
      access_token: "new-access-token",
      expires_in: 3600,
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockRefreshResponse),
    });

    const result = await authOptions.callbacks?.jwt?.({
      token: mockToken,
      account: null,
      user: null,
      profile: undefined,
      trigger: "update",
      isNewUser: false,
      session: null,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://login.microsoftonline.com/test-tenant-id/oauth2/v2.0/token",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      })
    );

    expect(result).toEqual({
      ...mockToken,
      accessToken: "new-access-token",
      expiresAt: expect.any(Number),
      refreshToken: "refresh-token", // Should keep existing refresh token
    });
  });

  it("should handle refresh token error", async () => {
    const mockToken = {
      accessToken: "expired-token",
      refreshToken: "refresh-token",
      provider: "google",
      expiresAt: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "invalid_grant" }),
    });

    const result = await authOptions.callbacks?.jwt?.({
      token: mockToken,
      account: null,
      user: null,
      profile: undefined,
      trigger: "update",
      isNewUser: false,
      session: null,
    });

    expect(result).toEqual({
      ...mockToken,
      error: "RefreshAccessTokenError",
    });
  });
});

describe("Session Callback", () => {
  it("should include access token and provider in session", async () => {
    const mockSession = {
      user: { name: "Test User", email: "test@example.com" },
      expires: "2024-01-01",
    };

    const mockToken = {
      accessToken: "test-access-token",
      provider: "google",
      error: undefined,
    };

    const result = await authOptions.callbacks?.session?.({
      session: mockSession,
      token: mockToken,
      user: null,
      trigger: "update",
      newSession: null,
    });

    expect(result).toEqual({
      ...mockSession,
      accessToken: "test-access-token",
      provider: "google",
      error: undefined,
    });
  });

  it("should include error in session when present", async () => {
    const mockSession = {
      user: { name: "Test User", email: "test@example.com" },
      expires: "2024-01-01",
    };

    const mockToken = {
      accessToken: "test-access-token",
      provider: "google",
      error: "RefreshAccessTokenError",
    };

    const result = await authOptions.callbacks?.session?.({
      session: mockSession,
      token: mockToken,
      user: null,
      trigger: "update",
      newSession: null,
    });

    expect(result).toEqual({
      ...mockSession,
      accessToken: "test-access-token",
      provider: "google",
      error: "RefreshAccessTokenError",
    });
  });
});
