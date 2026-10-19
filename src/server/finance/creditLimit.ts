// 信用卡額度：同一家機構的卡共用一份額度，所以按「機構」合併計算。
//   機構額度 = 該機構所有卡設定的額度取最大值（只要在其中一張卡填就好，其他張可留 0）
//   已占用   = 該機構所有卡的「目前未繳」＋ 進行中分期尚未入帳的剩餘金額（分期未到期也占額度）
//   剩餘額度 = 機構額度 − 已占用
// 帳戶沒填機構時，不跟別張卡合併（各自獨立）。純函式、不碰 Ragic。

export interface LimitCard {
  code: string;
  name: string;
  institution: string;
  balance: number; // 目前未繳（信用卡帳戶的 balance）
}

export interface LimitInstallment {
  card: string;
  status: string;
  remaining: number;
}

export interface CardLimitInfo {
  code: string;
  institution: string;
  shared: string[]; // 同機構的卡名稱（含自己）
  limit: number; // 機構額度，0 = 沒設
  used: number;
  remaining: number;
  usage: number | null; // 已占用 / 額度，沒設額度為 null
}

export function cardLimits(
  cards: LimitCard[],
  limitOf: (cardCode: string) => number,
  installments: LimitInstallment[],
  activeStatus = "進行中",
): Map<string, CardLimitInfo> {
  const groupKey = (c: LimitCard) => (c.institution.trim() ? `org:${c.institution.trim()}` : `card:${c.code}`);
  const groups = new Map<string, LimitCard[]>();
  for (const c of cards) groups.set(groupKey(c), [...(groups.get(groupKey(c)) ?? []), c]);

  const result = new Map<string, CardLimitInfo>();
  for (const members of groups.values()) {
    const codes = new Set(members.map((m) => m.code));
    const limit = Math.max(0, ...members.map((m) => limitOf(m.code)));
    const used =
      members.reduce((sum, m) => sum + m.balance, 0) +
      installments.filter((i) => codes.has(i.card) && i.status === activeStatus).reduce((sum, i) => sum + i.remaining, 0);
    for (const m of members) {
      result.set(m.code, {
        code: m.code,
        institution: m.institution.trim(),
        shared: members.map((x) => x.name),
        limit,
        used,
        remaining: limit - used,
        usage: limit > 0 ? used / limit : null,
      });
    }
  }
  return result;
}
