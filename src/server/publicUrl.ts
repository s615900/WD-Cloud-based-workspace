// 網站對外的完整網址。部署在 Replit 這類有反向代理的平台時，Next.js 收到的 request.url
// 會是內部位址（例如 http://localhost:5000），拿它組轉址或 LINE 回呼網址會對不上正式網域。
// 這裡優先讀代理帶進來的 x-forwarded-host／x-forwarded-proto，其次是 Host 標頭。
function firstValue(value: string | null): string {
  return value?.split(",")[0]?.trim() ?? "";
}

export function publicUrl(path: string, request: Request): URL {
  const headers = request.headers;
  const host = firstValue(headers.get("x-forwarded-host")) || firstValue(headers.get("host"));
  if (!host) return new URL(path, request.url);

  const forwardedProto = firstValue(headers.get("x-forwarded-proto"));
  const proto = forwardedProto || new URL(request.url).protocol.replace(":", "");
  return new URL(path, `${proto}://${host}`);
}
