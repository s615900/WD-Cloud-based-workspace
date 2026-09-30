import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/server/session";

export async function GET(request: Request) {
  const res = NextResponse.redirect(new URL("/auth/login", request.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
