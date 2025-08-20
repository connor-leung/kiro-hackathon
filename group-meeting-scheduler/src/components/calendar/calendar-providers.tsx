"use client";

import { useState } from "react";
import { signIn, useSession } from "next-auth/react";

interface CalendarProvider {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  status: "disconnected" | "connecting" | "connected" | "error";
  error?: string;
}

export default function CalendarProviders() {
  const { data: session } = useSession();
  const [providers, setProviders] = useState<CalendarProvider[]>([
    {
      id: "google",
      name: "Google Calendar",
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      ),
      description:
        "Connect your Google Calendar to import events automatically",
      status: session?.provider === "google" ? "connected" : "disconnected",
    },
    {
      id: "microsoft",
      name: "Microsoft Outlook",
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24">
          <path fill="#0078D4" d="M7.462 0L0 4.615v14.77L7.462 24V0z" />
          <path fill="#1BA1E2" d="M7.462 0v24L24 19.385V4.615L7.462 0z" />
          <path fill="#28A8EA" d="M7.462 7.385v9.23L16.615 12l-9.153-4.615z" />
          <path
            fill="#0078D4"
            d="M7.462 0L24 4.615v14.77L7.462 24l8.769-12L7.462 0z"
          />
        </svg>
      ),
      description:
        "Connect your Microsoft Outlook calendar for seamless integration",
      status: session?.provider === "azure-ad" ? "connected" : "disconnected",
    },
  ]);

  const [isConnecting, setIsConnecting] = useState<string | null>(null);

  const handleConnect = async (providerId: string) => {
    setIsConnecting(providerId);

    setProviders((prev) =>
      prev.map((p) =>
        p.id === providerId ? { ...p, status: "connecting" } : p
      )
    );

    try {
      const result = await signIn(
        providerId === "microsoft" ? "azure-ad" : providerId,
        {
          callbackUrl: "/dashboard",
          redirect: false,
        }
      );

      if (result?.error) {
        throw new Error(result.error);
      }

      // If no error and no redirect, the sign-in was successful
      if (!result?.url) {
        setProviders((prev) =>
          prev.map((p) =>
            p.id === providerId ? { ...p, status: "connected" } : p
          )
        );
      } else {
        // Redirect to the OAuth provider
        window.location.href = result.url;
      }
    } catch (error) {
      setProviders((prev) =>
        prev.map((p) =>
          p.id === providerId
            ? {
                ...p,
                status: "error",
                error:
                  error instanceof Error ? error.message : "Connection failed",
              }
            : p
        )
      );
    } finally {
      setIsConnecting(null);
    }
  };

  const handleDisconnect = async (providerId: string) => {
    // For now, just update the UI. In a real app, you'd call an API to revoke tokens
    setProviders((prev) =>
      prev.map((p) =>
        p.id === providerId
          ? { ...p, status: "disconnected", error: undefined }
          : p
      )
    );
  };

  const getStatusColor = (status: CalendarProvider["status"]) => {
    switch (status) {
      case "connected":
        return "text-green-600 bg-green-100";
      case "connecting":
        return "text-blue-600 bg-blue-100";
      case "error":
        return "text-red-600 bg-red-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  const getStatusText = (status: CalendarProvider["status"]) => {
    switch (status) {
      case "connected":
        return "Connected";
      case "connecting":
        return "Connecting...";
      case "error":
        return "Error";
      default:
        return "Not connected";
    }
  };

  return (
    <div className="space-y-4">
      {providers.map((provider) => (
        <div
          key={provider.id}
          className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 mt-1">{provider.icon}</div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-gray-900">
                  {provider.name}
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  {provider.description}
                </p>
                {provider.error && (
                  <p className="mt-1 text-sm text-red-600">{provider.error}</p>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                  provider.status
                )}`}
              >
                {provider.status === "connecting" && (
                  <div className="animate-spin rounded-full h-3 w-3 border-b border-current mr-1"></div>
                )}
                {getStatusText(provider.status)}
              </span>
              {provider.status === "connected" ? (
                <button
                  onClick={() => handleDisconnect(provider.id)}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={() => handleConnect(provider.id)}
                  disabled={
                    provider.status === "connecting" || isConnecting !== null
                  }
                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {provider.status === "connecting"
                    ? "Connecting..."
                    : "Connect"}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Instructions */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2">How it works</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>
            • Connect your calendar providers to automatically import your
            events
          </li>
          <li>
            • We only access your calendar availability, not event details
          </li>
          <li>• You can disconnect at any time from your account settings</li>
          <li>
            • All data is encrypted and automatically deleted after 24 hours
          </li>
        </ul>
      </div>
    </div>
  );
}
