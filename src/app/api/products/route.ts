// 產品及服務（唯讀）：對應 Ragic quotation-system/data-management/1（主表單Key 1000124）
// 只回傳「產品是否有效」=有效 的項目，給報價單選品項用。
import { ragicList, PRODUCT_FIELD, PRODUCT_READ_FIELD, SHEET } from "@/server/lib/quotationRagic";
import { str } from "@/server/modules/dates";
import { json } from "@/server/http";

export async function GET() {
  try {
    const data = await ragicList(SHEET.products, `where=${PRODUCT_FIELD.是否有效},eq,有效&subtables=0`);
    const items = Object.entries(data).map(([id, record]) => ({
      id: Number(id),
      code: str(record[PRODUCT_READ_FIELD.產品編號]),
      name: str(record[PRODUCT_READ_FIELD.名稱]),
      unit: str(record[PRODUCT_READ_FIELD.單位]),
      price: str(record[PRODUCT_READ_FIELD.出貨價]),
      category: str(record[PRODUCT_READ_FIELD.分類]),
    }));
    return json(items);
  } catch (err) {
    console.error("取得產品列表失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}
