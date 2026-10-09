// 診斷用測試頁各自的 manifest：start_url 指向自己，加入主畫面後才會開到同一個測試頁
export function generateStaticParams() {
  return ["black", "default", "translucent"].map((style) => ({ style }));
}

export async function GET(_req: Request, ctx: RouteContext<"/pwa-test/[style]/manifest.json">) {
  const { style } = await ctx.params;
  return Response.json({
    id: `/pwa-test/${style}`,
    name: `測試-${style}`,
    short_name: `測試-${style}`,
    start_url: `/pwa-test/${style}`,
    scope: `/pwa-test/${style}`,
    display: "standalone",
    background_color: "#0B3D5C",
    theme_color: "#0B3D5C",
    icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  });
}
