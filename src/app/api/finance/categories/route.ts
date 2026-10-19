import { json, queryParam, readBody } from "@/server/http";
import { handle } from "@/server/finance/route";
import { createCategory, listCategories, type CategoryBody } from "@/server/finance/service";

// 預設只回傳啟用的分類；?all=1 回傳全部
export function GET(req: Request) {
  return handle("讀取分類", async () => {
    const all = await listCategories();
    return json(queryParam(req, "all") === "1" ? all : all.filter((c) => c.active));
  });
}

export function POST(req: Request) {
  return handle("新增分類", async () => {
    const id = await createCategory(await readBody<CategoryBody>(req));
    return json({ success: true, id });
  });
}
