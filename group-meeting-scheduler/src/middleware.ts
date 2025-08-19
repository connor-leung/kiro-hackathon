import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    // Add any additional middleware logic here
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Protect API routes
        if (req.nextUrl.pathname.startsWith("/api/")) {
          // Allow auth endpoints
          if (req.nextUrl.pathname.startsWith("/api/auth/")) {
            return true;
          }
          // Require authentication for other API routes
          return !!token;
        }

        // Protect dashboard and other authenticated pages
        if (req.nextUrl.pathname.startsWith("/dashboard")) {
          return !!token;
        }

        // Allow access to public pages
        return true;
      },
    },
  }
);

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
