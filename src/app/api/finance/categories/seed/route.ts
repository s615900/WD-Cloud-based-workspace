import { json, queryParam } from "@/server/http";
import { handle } from "@/server/finance/route";
import { seedCategories } from "@/server/finance/service";

// 寫入預設分類；?dryRun=1 只回傳會新增／跳過哪些，不寫入。已存在同名分類一律跳過。
export function POST(req: Request) {
  return handle("建立預設分類", async () => {
    const dryRun = queryParam(req, "dryRun") === "1";
    return json(await seedCategories(dryRun));
  });
}
