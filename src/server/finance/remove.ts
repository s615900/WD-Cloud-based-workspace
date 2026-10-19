// 刪除：帳戶、定期規則、貸款（連同利率異動）、保單、分期。
// 原則：已經被其他資料「用過」的就不能刪，改成停用／改狀態，避免舊明細對不上、
// 也避免編號被重用後，新項目的來源鍵撞到舊明細而被當成「已產生」跳過。

import { finDelete, finList } from "./ragic";
import { F8B } from "./ragicFields";
import { str } from "@/server/modules/dates";
import { listAccounts, listTransactions, fail } from "./service";
import { listCardSettings, listInstallmentBases, listLoans, listPolicies, listRules, listStatements } from "./entities";

async function generatedCount(prefix: string): Promise<number> {
  return (await listTransactions()).filter((t) => t.sourceKey.startsWith(prefix)).length;
}

export async function deleteAccount(recordId: string): Promise<void> {
  const acc = (await listAccounts()).find((a) => a.id === recordId);
  if (!acc) fail("找不到這個帳戶", 404);
  const code = acc.code;
  const [txs, rules, cards, statements, insts, loans, policies] = await Promise.all([
    listTransactions(),
    listRules(),
    listCardSettings(),
    listStatements(),
    listInstallmentBases(),
    listLoans(),
    listPolicies(),
  ]);
  const used: string[] = [];
  const txCount = txs.filter((t) => t.account === code || t.toAccount === code).length;
  if (txCount) used.push(`${txCount} 筆收支明細`);
  const add = (n: number, label: string) => n > 0 && used.push(`${n} ${label}`);
  add(rules.filter((r) => r.account === code || r.toAccount === code).length, "條定期規則");
  add(statements.filter((s) => s.card === code).length, "張信用卡帳單");
  add(insts.filter((i) => i.card === code).length, "筆分期");
  add(loans.filter((l) => l.account === code).length, "筆貸款");
  add(policies.filter((p) => p.account === code).length, "張保單");
  add(cards.filter((c) => c.autoDebitAccount === code).length, "張信用卡的自動扣繳設定");
  if (used.length > 0) fail(`這個帳戶已被使用（${used.join("、")}），不能刪除；請改成「停用」`);
  // 只剩這張卡自己的結帳設定時，一併刪除
  for (const c of cards.filter((x) => x.account === code)) await finDelete("F5_CARD", c.id);
  await finDelete("F1_ACCOUNT", recordId);
}

export async function deleteRule(recordId: string): Promise<void> {
  const rule = (await listRules()).find((r) => r.id === recordId);
  if (!rule) fail("找不到這條規則", 404);
  const n = await generatedCount(`RULE-${rule.code}-`);
  if (n > 0) fail(`這條規則已經產生過 ${n} 筆明細，不能刪除；請改成「停用」`);
  await finDelete("F4_RECURRING", recordId);
}

export async function deleteLoan(recordId: string): Promise<void> {
  const loan = (await listLoans()).find((l) => l.id === recordId);
  if (!loan) fail("找不到這筆貸款", 404);
  const n = await generatedCount(`LOAN-${loan.code}-`);
  if (n > 0) fail(`這筆貸款已經扣過 ${n} 期，不能刪除；請把狀態改成「已結清」或「提前清償」`);
  for (const r of await finList("F8B_RATE_CHANGE")) {
    if (str(r.rec["貸款編號" satisfies keyof typeof F8B]) === loan.code) await finDelete("F8B_RATE_CHANGE", r.id);
  }
  await finDelete("F8_LOAN", recordId);
}

export async function deletePolicy(recordId: string): Promise<void> {
  const p = (await listPolicies()).find((x) => x.id === recordId);
  if (!p) fail("找不到這張保單", 404);
  const n = await generatedCount(`INS-${p.code}-`);
  if (n > 0) fail(`這張保單已經產生過 ${n} 筆繳費明細，不能刪除；請把狀態改成「停效」或「解約」`);
  await finDelete("F9_INSURANCE", recordId);
}

export async function deleteInstallment(recordId: string): Promise<void> {
  const i = (await listInstallmentBases()).find((x) => x.id === recordId);
  if (!i) fail("找不到這筆分期", 404);
  const n = await generatedCount(`INST-${i.code}-`);
  if (n > 0) fail(`這筆分期已經入帳 ${n} 期，不能刪除；請把狀態改成「提前清償」`);
  await finDelete("F7_INSTALLMENT", recordId);
}
