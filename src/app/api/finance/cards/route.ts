import { json, readBody } from "@/server/http";
import { listCardSettings, saveCardSetting, type CardSettingBody } from "@/server/finance/entities";
import { handle, handleWrite } from "@/server/finance/route";

export function GET() {
  return handle("讀取信用卡設定", async () => json(await listCardSettings()));
}

// 一卡一筆：已有該卡設定就更新，沒有就新增
export function POST(req: Request) {
  return handleWrite("儲存信用卡設定", async () => json({ success: true, ...(await saveCardSetting(await readBody<CardSettingBody>(req))) }));
}
