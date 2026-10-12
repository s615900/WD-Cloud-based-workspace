// 預排班相關的共用設定。
// 這些班別只用在行事曆，不列入預排班（不算工時與薪資）；首頁週班表會改從行事曆顯示它們。
// 要增減就改這裡的名字（跟班別模板名稱一字不差）。
export const PLAN_EXCLUDED_TEMPLATES: ReadonlySet<string> = new Set(["拍攝賽事", "夜班"]);
