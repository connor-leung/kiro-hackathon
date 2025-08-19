import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth";
import { redirect } from "next/navigation";

export async function getRequiredServerSession() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  return session;
}

export async function getOptionalServerSession() {
  return await getServerSession(authOptions);
}

export function isTokenExpired(expiresAt?: number): boolean {
  if (!expiresAt) return true;
  return Date.now() >= expiresAt * 1000;
}

export function getProviderName(provider: string): string {
  switch (provider) {
    case "google":
      return "Google";
    case "azure-ad":
      return "Microsoft";
    default:
      return provider;
  }
}
