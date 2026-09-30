import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/server/session";
import { publicUrl } from "@/server/publicUrl";

export async function GET(request: Request) {
  const res = NextResponse.redirect(publicUrl("/auth/login", request));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
