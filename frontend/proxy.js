import { NextResponse } from "next/server";

const cookieName = process.env.NEXT_PUBLIC_AUTH_COOKIE_NAME || "roc_session";

function isProtectedPath(pathname) {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/apply" || pathname.startsWith("/apply/");
}

export function proxy(request) {
  const { pathname } = request.nextUrl;
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  if (request.cookies.has(cookieName)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/apply/:path*"],
};
