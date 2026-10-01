import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/server/session";
import { publicUrl } from "@/server/publicUrl";

// 登出後不直接導回 /auth/login：瀏覽器／手機若已登入 LINE，LINE 會自動登入又跳回來，
// 看起來像沒登出。改導到「已登出」頁，要不要重新登入由使用者自己按。
export async function GET(request: Request) {
  const res = NextResponse.redirect(publicUrl("/logged-out", request));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
