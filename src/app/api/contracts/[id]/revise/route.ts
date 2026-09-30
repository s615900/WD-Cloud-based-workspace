// 作廢並建立新版本：客戶簽名後合約內容鎖定，要修改就用這支。
// 複製原合約的內容（品項、金額、條款、客戶資料）建立一份新的草稿合約（不帶任何簽名），
// 再把原合約設為作廢。順序是「先建新的、再作廢舊的」，建立失敗時舊合約維持原狀。
import {
  ragicGetOne,
  ragicUpdate,
  createContractWithItems,
  unwrapSubtableRows,
  CONTRACT_FIELD,
  CONTRACT_READ_FIELD,
  CONTRACT_ITEM_SUBTABLE_READ_KEY,
  SHEET,
} from "@/server/lib/quotationRagic";
import { toContractItemView } from "@/server/modules/contracts";
import { str } from "@/server/modules/dates";
import { errorMessage, json, lockedResponse } from "@/server/http";

export async function POST(_req: Request, ctx: RouteContext<"/api/contracts/[id]/revise">) {
  const locked = lockedResponse("contracts");
  if (locked) return locked;

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return json({ success: false, error: "id 格式錯誤" }, 400);

  try {
    const record = await ragicGetOne(SHEET.contracts, id);
    if (!record || Object.keys(record).length === 0) {
      return json({ success: false, error: "找不到這筆合約" }, 404);
    }

    const read = (key: keyof typeof CONTRACT_READ_FIELD) => str(record[CONTRACT_READ_FIELD[key]]);
    const items = unwrapSubtableRows(record[CONTRACT_ITEM_SUBTABLE_READ_KEY]).map((row) => {
      const { name, price, unit, qty } = toContractItemView(row);
      return { name, price, unit, qty: qty || "1" };
    });

    const newId = await createContractWithItems(
      {
        [CONTRACT_FIELD.報價單號]: read("報價單號"),
        [CONTRACT_FIELD.客戶名稱]: read("客戶名稱"),
        [CONTRACT_FIELD.統一編號]: read("統一編號"),
        [CONTRACT_FIELD.聯絡人]: read("聯絡人"),
        [CONTRACT_FIELD.聯絡人電話]: read("聯絡人電話"),
        [CONTRACT_FIELD.聯絡地址]: read("聯絡地址"),
        [CONTRACT_FIELD.Email]: read("Email"),
        [CONTRACT_FIELD.關聯專案]: read("關聯專案"),
        [CONTRACT_FIELD.報價日期]: read("報價日期"),
        [CONTRACT_FIELD.有效期限]: read("有效期限"),
        [CONTRACT_FIELD.合約金額]: read("合約金額"),
        [CONTRACT_FIELD.保密條款內容NDA]: read("保密條款內容NDA"),
        [CONTRACT_FIELD.備註]: read("備註"),
        [CONTRACT_FIELD.狀態]: "草稿",
      },
      items,
    );

    if (read("狀態") !== "作廢") {
      try {
        await ragicUpdate(SHEET.contracts, id, { [CONTRACT_FIELD.狀態]: "作廢" });
      } catch (err) {
        // 新版本已經建好，只是舊版沒作廢成功：回報給使用者手動作廢，不要讓新版本白建
        console.error("建立新版本後作廢舊合約失敗:", err);
        return json({
          success: true,
          id: newId,
          warning: `新版本已建立，但原合約作廢失敗，請回原合約手動作廢（${errorMessage(err, "更新失敗")}）`,
        });
      }
    }

    return json({ success: true, id: newId });
  } catch (err) {
    console.error("建立合約新版本失敗:", err);
    return json({ success: false, error: errorMessage(err, "建立新版本失敗") }, 500);
  }
}
