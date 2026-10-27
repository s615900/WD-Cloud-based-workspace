"use client";

import { useState } from "react";
import type { MonthlyPoint } from "@/lib/financeTypes";
import s from "./finance.module.css";
import { money } from "./shared";

type Range = "6" | "12" | "year";
type Mode = "bar" | "line";

const W = 640;
const H = 220;
const PAD = { top: 12, right: 12, bottom: 28, left: 52 };

function compact(n: number): string {
  return n >= 10000 ? `${(n / 10000).toFixed(n % 10000 === 0 ? 0 : 1)}萬` : String(n);
}

// 每月收支圖：近 6 個月／近 12 個月／今年，長條圖或折線圖（純 SVG，不用額外套件）
export function MonthlyChart({ data }: { data: MonthlyPoint[] }) {
  const [range, setRange] = useState<Range>("6");
  const [mode, setMode] = useState<Mode>("bar");

  const thisYear = data.length > 0 ? data[data.length - 1].month.slice(0, 4) : "";
  const points = range === "6" ? data.slice(-6) : range === "12" ? data : data.filter((p) => p.month.startsWith(thisYear));
  const max = Math.max(1, ...points.flatMap((p) => [p.income, p.expense]));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const step = points.length > 0 ? innerW / points.length : innerW;
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const cx = (i: number) => PAD.left + step * i + step / 2;
  const line = (pick: (p: MonthlyPoint) => number) => points.map((p, i) => `${i === 0 ? "M" : "L"}${cx(i)},${y(pick(p))}`).join(" ");
  const barW = Math.min(18, step / 3);
  const ticks = [0, 0.5, 1].map((r) => Math.round(max * r));

  return (
    <div className={s.card}>
      <div className={s.chartHead}>
        <h3 className={s.cardTitle} style={{ margin: 0 }}>
          每月收支
        </h3>
        <div className={s.chartTools}>
          {([["6", "近 6 個月"], ["12", "近 12 個月"], ["year", "今年"]] as const).map(([v, label]) => (
            <button key={v} className={`${s.btn} ${s.btnSm} ${range === v ? s.btnPrimary : ""}`} onClick={() => setRange(v)} aria-pressed={range === v}>
              {label}
            </button>
          ))}
          <span className={s.chartSep} />
          {([["bar", "長條圖"], ["line", "折線圖"]] as const).map(([v, label]) => (
            <button key={v} className={`${s.btn} ${s.btnSm} ${mode === v ? s.btnPrimary : ""}`} onClick={() => setMode(v)} aria-pressed={mode === v}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className={s.chartSvg} role="img" aria-label="每月收入與支出圖表" data-testid="monthly-chart">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={s.chartGrid} />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className={s.chartText}>
              {compact(t)}
            </text>
          </g>
        ))}
        {mode === "bar"
          ? points.map((p, i) => (
              <g key={p.month}>
                <rect x={cx(i) - barW - 1} y={y(p.income)} width={barW} height={innerH - (y(p.income) - PAD.top)} className={s.chartIncome}>
                  <title>{`${p.month} 收入 ${money(p.income)}`}</title>
                </rect>
                <rect x={cx(i) + 1} y={y(p.expense)} width={barW} height={innerH - (y(p.expense) - PAD.top)} className={s.chartExpense}>
                  <title>{`${p.month} 支出 ${money(p.expense)}`}</title>
                </rect>
              </g>
            ))
          : (
            <>
              <path d={line((p) => p.income)} className={s.chartLineIncome} />
              <path d={line((p) => p.expense)} className={s.chartLineExpense} />
              {points.map((p, i) => (
                <g key={p.month}>
                  <circle cx={cx(i)} cy={y(p.income)} r={3.5} className={s.chartIncome}>
                    <title>{`${p.month} 收入 ${money(p.income)}`}</title>
                  </circle>
                  <circle cx={cx(i)} cy={y(p.expense)} r={3.5} className={s.chartExpense}>
                    <title>{`${p.month} 支出 ${money(p.expense)}`}</title>
                  </circle>
                </g>
              ))}
            </>
          )}
        {points.map((p, i) => (
          <text key={p.month} x={cx(i)} y={H - 8} textAnchor="middle" className={s.chartText}>
            {points.length > 8 ? Number(p.month.slice(5)) : p.month.slice(2).replace("-", "/")}
          </text>
        ))}
      </svg>
      <div className={s.chartLegend}>
        <span><i className={s.chartIncome} /> 收入</span>
        <span><i className={s.chartExpense} /> 支出</span>
        <span className={s.sub}>只計已入帳的明細，不含轉帳</span>
      </div>
    </div>
  );
}
