"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalcRow, EmptyRow, Message, Modal, ModalActions, PageHeader, type MessageState } from "@/components/ui";
import { apiFetch, errorText, formatCurrency, sendJson, todayISO, toInputDate } from "@/lib/client";
import type { ClientItem, ProductItem, QuoteDetail, QuoteItem } from "@/lib/types";

const TAX_RATE = 0.05; // 目前系統只支援單一稅率（營業稅 5%），固定不做成選單
const DISCOUNT_OPTIONS = [100, 95, 90, 85, 80];

// 選定客戶後會帶入、也可以手動覆蓋的欄位
const CLIENT_FIELDS = [
  { key: "clientName", label: "客戶名稱" },
  { key: "taxId", label: "統一編號" },
  { key: "address", label: "聯絡地址", span2: true },
  { key: "contact", label: "聯絡人" },
  { key: "companyPhone", label: "公司電話" },
  { key: "contactPhone", label: "聯絡人電話" },
  { key: "email", label: "電子郵件" },
] as const;

type ClientFieldKey = (typeof CLIENT_FIELDS)[number]["key"];

interface FormState extends Record<ClientFieldKey, string> {
  clientId: string;
  projectName: string;
  quoteDate: string;
  validUntil: string;
  taxMode: string;
  discount: string; // 百分比（"90"），送出時才換算成 Ragic 的小數倍率（"0.9"）
  note: string;
  contractTerms: string;
}

const EMPTY: FormState = {
  clientId: "",
  clientName: "",
  taxId: "",
  address: "",
  contact: "",
  companyPhone: "",
  contactPhone: "",
  email: "",
  projectName: "",
  quoteDate: "",
  validUntil: "",
  taxMode: "稅外加",
  discount: "100",
  note: "",
  contractTerms: "",
};

// 純前端即時試算，邏輯跟後端 calcQuoteTotals 完全對齊，試算數字才會跟送出後存的金額一致
function calculate(items: QuoteItem[], discountPercent: number, taxMode: string) {
  const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.price) || 0) * (parseFloat(item.qty) || 0), 0);
  const afterDiscount = subtotal * (discountPercent / 100);
  let untaxed: number;
  let tax: number;
  let total: number;
  if (taxMode === "稅內含") {
    untaxed = afterDiscount / (1 + TAX_RATE);
    total = afterDiscount;
    tax = total - untaxed;
  } else {
    untaxed = afterDiscount;
    tax = untaxed * TAX_RATE;
    total = untaxed + tax;
  }
  return { subtotal, afterDiscount, untaxed, tax, total };
}

export function QuoteForm({ editId }: { editId: string | null }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => (editId ? EMPTY : { ...EMPTY, quoteDate: todayISO() }));
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [clients, setClients] = useState<ClientItem[] | null>(null);
  const [clientsFailed, setClientsFailed] = useState(false);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [title, setTitle] = useState(editId ? "編輯報價單" : "新增報價單");
  // 編輯既有報價單時，原始折扣率不在 5 個級距上就動態補一個選項，不要悄悄把資料變成別的級距
  const [extraDiscount, setExtraDiscount] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState>({ text: "" });

  useEffect(() => {
    (async () => {
      // 客戶下拉選項要先載入完成，編輯模式設定的客戶值才選得中
      const [clientList, productList] = await Promise.all([
        apiFetch<ClientItem[]>("/api/clients").catch(() => null),
        apiFetch<ProductItem[]>("/api/products").catch(() => [] as ProductItem[]),
      ]);
      setClients(clientList ?? []);
      setClientsFailed(clientList === null);
      setProducts(productList);
      if (!editId) return;

      try {
        const d = await apiFetch<QuoteDetail>(`/api/quotes/${editId}`);
        setTitle(`編輯報價單 ${d.quoteNumber || `#${editId}`}`);
        const percent = Math.round(Number(d.discountRate) * 100);
        const hasDiscount = d.discountRate !== "" && d.discountRate !== undefined && Number.isFinite(percent);
        if (hasDiscount && !DISCOUNT_OPTIONS.includes(percent)) setExtraDiscount(percent);
        setForm({
          clientId: d.clientId,
          clientName: d.clientName || "",
          taxId: d.taxId || "",
          address: d.address || "",
          contact: d.contact || "",
          companyPhone: d.companyPhone || "",
          contactPhone: d.contactPhone || "",
          email: d.email || "",
          projectName: d.projectName || "",
          quoteDate: toInputDate(d.quoteDate),
          validUntil: toInputDate(d.validUntil),
          taxMode: d.taxMode || "稅外加",
          discount: hasDiscount ? String(percent) : "100",
          note: d.note || "",
          contractTerms: d.contractTerms || "",
        });
        setItems(
          (d.items || []).map((i) => ({
            productId: i.productId,
            name: i.name,
            price: i.price,
            unit: i.unit,
            qty: i.qty,
            note: i.note,
          })),
        );
      } catch (err) {
        setMessage({ text: `載入既有報價單失敗：${errorText(err)}`, kind: "error" });
      }
    })();
  }, [editId]);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  // 客戶一選定就立即帶入關聯欄位（仍可手動覆蓋）。選項 value 用客戶編號（例：C-0002），
  // 不是 Ragic 內部紀錄編號——Ragic「客戶編號」連結欄位要的是這個顯示值。
  function selectClient(code: string) {
    const c = clients?.find((x) => String(x.code) === code);
    setForm((f) =>
      c
        ? {
            ...f,
            clientId: code,
            clientName: c.name || "",
            taxId: c.taxId || "",
            address: c.address || "",
            contact: c.contact || "",
            companyPhone: c.companyPhone || "",
            contactPhone: c.contactPhone || "",
            email: c.email || "",
          }
        : { ...f, clientId: code },
    );
  }

  function updateItem(index: number, field: keyof QuoteItem, value: string) {
    setItems((list) => list.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  const calc = calculate(items, Number(form.discount) || 100, form.taxMode);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.clientId) return setMessage({ text: "請選擇客戶", kind: "error" });
    if (!form.quoteDate) return setMessage({ text: "請選擇報價日期", kind: "error" });
    if (!form.projectName.trim()) return setMessage({ text: "請填寫專案名稱", kind: "error" });
    const missingQty = items.findIndex((i) => !i.qty);
    if (missingQty >= 0) return setMessage({ text: `第 ${missingQty + 1} 項品項請填寫數量`, kind: "error" });

    const optional = (v: string) => (v.trim() === "" ? undefined : v.trim());
    const payload: Record<string, unknown> = {
      clientId: form.clientId,
      projectName: form.projectName.trim(),
      quoteDate: form.quoteDate,
      validUntil: optional(form.validUntil),
      taxType: "營業稅",
      taxMode: form.taxMode,
      taxRate: String(TAX_RATE),
      discountRate: String((Number(form.discount) || 100) / 100),
      note: optional(form.note),
      contractTerms: optional(form.contractTerms),
      ...Object.fromEntries(CLIENT_FIELDS.map(({ key }) => [key, optional(form[key])])),
      items: items.map(({ productId, name, price, unit, qty, note }) => ({ productId, name, price, unit, qty, note })),
    };
    for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];

    setSaving(true);
    setMessage({ text: "儲存中…" });
    try {
      let targetId = editId;
      if (editId) await sendJson(`/api/quotes/${editId}`, "PATCH", payload);
      else targetId = String((await sendJson<{ id: number }>("/api/quotes", "POST", payload)).id);
      setMessage({ text: "已儲存，正在前往詳情頁…", kind: "success" });
      router.push(`/desktop/quotes/${targetId}`);
    } catch (err) {
      setMessage({ text: errorText(err, "儲存失敗"), kind: "error" });
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title={title}
        subtitle="畫面上的金額是依目前品項即時試算，送出後會導向這筆報價單的詳情頁"
        actions={
          <Link className="btn btn-outline" href="/desktop/quotes">
            ‹ 返回列表
          </Link>
        }
      />

      <form onSubmit={submit}>
        <div className="card mb-5">
          <h3>客戶資料</h3>
          <div className="form-grid">
            <div className="form-field">
              <label>
                客戶<span className="ml-0.5 text-danger">*</span>
              </label>
              <select className="input" value={form.clientId} onChange={(e) => selectClient(e.target.value)}>
                {clients === null ? (
                  <option value="">載入中…</option>
                ) : (
                  <>
                    <option value="">{clientsFailed ? "客戶載入失敗" : "請選擇客戶"}</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.code}>
                        {c.name}
                        {c.taxId ? `（${c.taxId}）` : ""}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
          </div>
          <p className="form-hint mt-3.5 mb-2">選定客戶後會立即帶入以下欄位，也可以在這裡覆蓋：</p>
          <div className="form-grid">
            {CLIENT_FIELDS.map((f) => (
              <div key={f.key} className={`form-field ${"span2" in f ? "sm:col-span-2" : ""}`}>
                <label>{f.label}</label>
                <input className="input" value={form[f.key]} onChange={set(f.key)} placeholder="自動帶入" />
              </div>
            ))}
          </div>
        </div>

        <div className="card mb-5">
          <h3>報價資訊</h3>
          <div className="form-grid">
            <div className="form-field sm:col-span-2">
              <label>
                專案名稱<span className="ml-0.5 text-danger">*</span>
              </label>
              <input className="input" value={form.projectName} onChange={set("projectName")} placeholder="例如：王小明婚禮紀錄" />
              <p className="form-hint">若和既有報價單撞名，儲存時會自動加上 -2、-3 後綴，不用自己改名</p>
            </div>
            <div className="form-field">
              <label>
                報價日期<span className="ml-0.5 text-danger">*</span>
              </label>
              <input className="input" type="date" value={form.quoteDate} onChange={set("quoteDate")} />
            </div>
            <div className="form-field">
              <label>報價有效期限</label>
              <input className="input" type="date" value={form.validUntil} onChange={set("validUntil")} />
            </div>
            <div className="form-field">
              <label>課稅別</label>
              <div className="input bg-subtle">營業稅</div>
            </div>
            <div className="form-field">
              <label>稅率</label>
              <div className="input bg-subtle">5%</div>
            </div>
            <div className="form-field">
              <label>計稅方式</label>
              <select className="input" value={form.taxMode} onChange={set("taxMode")}>
                <option value="稅外加">稅外加（單價未稅，另外加稅額）</option>
                <option value="稅內含">稅內含（單價已含稅）</option>
              </select>
            </div>
            <div className="form-field">
              <label>折扣率</label>
              <select className="input" value={form.discount} onChange={set("discount")}>
                {extraDiscount !== null && <option value={String(extraDiscount)}>{extraDiscount}%（原始值）</option>}
                {DISCOUNT_OPTIONS.map((p) => (
                  <option key={p} value={String(p)}>
                    {p === 100 ? "100%（不打折）" : `${p}%`}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field sm:col-span-2">
              <label>特別說明</label>
              <textarea className="input" value={form.note} onChange={set("note")} />
            </div>
            <div className="form-field sm:col-span-2">
              <label>合約條款內容</label>
              <textarea
                className="input"
                value={form.contractTerms}
                onChange={set("contractTerms")}
                placeholder="客戶在簽署頁會看到這段文字，簽名前需確認閱讀"
              />
            </div>
          </div>
        </div>

        <div className="card mb-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="mb-0">品項</h3>
            <button type="button" className="btn btn-outline" onClick={() => setPickerOpen(true)}>
              + 新增品項
            </button>
          </div>
          {/* 手機：每個品項一張卡片 */}
          <div className="flex flex-col gap-2.5 md:hidden">
            {items.length === 0 ? (
              <p className="empty-hint">尚未加入品項</p>
            ) : (
              items.map((item, index) => (
                <div key={index} className="rounded-[12px] border border-line p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{item.name}</div>
                      <div className="form-hint">{item.productId}</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => setItems((list) => list.filter((_, i) => i !== index))}
                    >
                      移除
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ["price", "單價"],
                        ["unit", "單位"],
                        ["qty", "數量"],
                      ] as const
                    ).map(([field, label]) => (
                      <label key={field} className="flex flex-col gap-1 text-xs text-muted">
                        {label}
                        <input
                          className="input-sm text-ink"
                          inputMode={field === "unit" ? undefined : "decimal"}
                          value={item[field] ?? ""}
                          onChange={(e) => updateItem(index, field, e.target.value)}
                        />
                      </label>
                    ))}
                    <label className="col-span-3 flex flex-col gap-1 text-xs text-muted">
                      備註
                      <input className="input-sm text-ink" value={item.note ?? ""} onChange={(e) => updateItem(index, "note", e.target.value)} />
                    </label>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>品項</th>
                  <th className="w-[110px]">單價</th>
                  <th className="w-[90px]">單位</th>
                  <th className="w-[90px]">數量</th>
                  <th>備註</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <EmptyRow colSpan={6}>尚未加入品項</EmptyRow>
                ) : (
                  items.map((item, index) => (
                    <tr key={index}>
                      <td>
                        {item.name}
                        <div className="form-hint">{item.productId}</div>
                      </td>
                      {(["price", "unit", "qty", "note"] as const).map((field) => (
                        <td key={field}>
                          <input
                            className="input-sm"
                            value={item[field] ?? ""}
                            onChange={(e) => updateItem(index, field, e.target.value)}
                          />
                        </td>
                      ))}
                      <td>
                        <button
                          type="button"
                          className="btn btn-danger px-2.5 py-[5px] text-xs"
                          onClick={() => setItems((list) => list.filter((_, i) => i !== index))}
                        >
                          移除
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3>金額試算</h3>
          <p className="form-hint mb-3">依目前品項即時計算，不用等送出存檔</p>
          <div className="flex max-w-[420px] flex-col gap-2">
            <CalcRow label="品項小計" value={formatCurrency(calc.subtotal)} />
            <CalcRow label="套用折扣後金額" value={formatCurrency(calc.afterDiscount)} />
            <CalcRow label="未稅金額" value={formatCurrency(calc.untaxed)} />
            <CalcRow label="稅額（5%）" value={formatCurrency(calc.tax)} />
            <CalcRow label="總金額（含稅）" value={formatCurrency(calc.total)} total />
          </div>
        </div>

        <div className="mt-5">
          <button type="submit" className="btn btn-gold" disabled={saving}>
            儲存報價單
          </button>
          <Message state={message} />
        </div>
      </form>

      {pickerOpen && (
        <ProductPicker
          products={products}
          onClose={() => setPickerOpen(false)}
          onPick={(p) => {
            // productId 存產品編號，不是 Ragic 內部紀錄編號（理由同客戶編號連結欄位）
            setItems((list) => [...list, { productId: p.code, name: p.name, price: p.price, unit: p.unit, qty: "1", note: "" }]);
            setPickerOpen(false);
          }}
        />
      )}
    </>
  );
}

function ProductPicker({
  products,
  onClose,
  onPick,
}: {
  products: ProductItem[];
  onClose: () => void;
  onPick: (p: ProductItem) => void;
}) {
  const [filter, setFilter] = useState("");
  const t = filter.toLowerCase();
  const filtered = products.filter((p) => !t || p.name.toLowerCase().includes(t) || p.code.toLowerCase().includes(t));

  return (
    <Modal open onClose={onClose} title="選擇產品／服務">
      <input className="input mb-3.5 w-full" placeholder="搜尋名稱或編號…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="max-h-[360px] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="empty-hint">沒有符合的產品</p>
        ) : (
          filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p)}
              className="mb-2.5 block w-full cursor-pointer rounded-[10px] bg-white p-3 text-left text-[13px] shadow-card hover:bg-subtle"
            >
              <div className="flex justify-between">
                <strong>{p.name}</strong>
                <span className="badge badge-gold">{p.price}</span>
              </div>
              <div className="form-hint">
                {p.code}・{p.category}・{p.unit}
              </div>
            </button>
          ))
        )}
      </div>
      <ModalActions>
        <button type="button" className="btn btn-outline" onClick={onClose}>
          關閉
        </button>
      </ModalActions>
    </Modal>
  );
}
