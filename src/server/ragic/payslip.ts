// 薪資實領（/ragicforms21/15）讀寫層：每個「期別＋班別」一筆實領金額，跟預排班算出的薪資對帳。
// 金額留空或 0＝取消（刪除紀錄）。GET 用中文欄位名、POST 用欄位編號（見 fields.ts）。
import { ragicList, ragicCreate, ragicUpdate, ragicDelete } from "./client";
import { F_PAYSLIP } from "./fields";

export interface PayslipItem {
  id: number;
  period: string; // yyyy-MM
  name: string; // 班別名稱
  amount: number;
}

export async function listPayslips(period?: string): Promise<PayslipItem[]> {
  const data = await ragicList("payslip");
  return Object.entries(data)
    .map(([id, r]) => ({
      id: Number(id),
      period: String(r["期別"] ?? "").trim(),
      name: String(r["班別"] ?? "").trim(),
      amount: Number(String(r["實領金額"] ?? "").replaceAll(",", "")) || 0,
    }))
    .filter((p) => p.period && p.name && (period === undefined || p.period === period));
}

export async function setPayslip(period: string, name: string, amount: number): Promise<void> {
  const current = (await listPayslips(period)).find((p) => p.name === name);
  if (amount === 0) {
    if (current) await ragicDelete("payslip", current.id);
  } else if (current) {
    await ragicUpdate("payslip", current.id, { [String(F_PAYSLIP.amount)]: String(amount) });
  } else {
    await ragicCreate("payslip", {
      [String(F_PAYSLIP.period)]: period,
      [String(F_PAYSLIP.name)]: name,
      [String(F_PAYSLIP.amount)]: String(amount),
    });
  }
}
