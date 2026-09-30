// 產生客戶簽署頁的公開連結（token 憑證）。這支本身受登入保護，只有自己人可以產生連結；
// 產生出來的連結才是要傳給客戶、免登入即可開啟的那條。
import { ragicGetOne, SHEET } from "@/server/lib/quotationRagic";
import { signQuoteToken } from "@/server/lib/quoteSignToken";
import { errorMessage, json, lockedResponse } from "@/server/http";

export async function POST(_req: Request, ctx: RouteContext<"/api/quotes/[id]/sign-link">) {
  const locked = lockedResponse("quotes");
  if (locked) return locked;

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return json({ success: false, error: "id 格式錯誤" }, 400);

  try {
    const record = await ragicGetOne(SHEET.quotes, id);
    if (!record || Object.keys(record).length === 0) {
      return json({ success: false, error: "找不到這筆報價單" }, 404);
    }
    return json({ success: true, token: signQuoteToken(id) });
  } catch (err) {
    console.error("產生簽署連結失敗:", err);
    return json({ success: false, error: errorMessage(err, "產生連結失敗") }, 500);
  }
}
