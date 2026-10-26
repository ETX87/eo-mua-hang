import { useState, type ReactNode } from "react";
import { I } from "../lib/icons";
import { Clip } from "./Clip";
import { boDau } from "../lib/tonDong";

/** Chuoi tim kiem cua 1 dong: moi gia tri nguyen thuy (1 cap long nhau), bo dau. */
const chuoiTim = (row: unknown): string => {
  if (row == null || typeof row !== "object") return boDau(String(row ?? ""));
  return boDau(Object.values(row as Record<string, unknown>).map((v) => (v != null && typeof v === "object" ? Object.values(v as object).join(" ") : String(v ?? ""))).join(" "));
};

export interface Col<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  width?: number | string;
  sticky?: boolean;
  /** Rong toi da cua o chu (mac dinh = width hoac 240px); qua dai hien "…" + tooltip. Cot so / can giua khong cat. */
  maxW?: number | string;
  /** true = khong cat chu (cho o can xuong dong, vd o nhap lieu). */
  wrap?: boolean;
}

export const PAGE_SIZE = 10; // quy uoc: moi bang 10 dong / trang

/**
 * Cot thao tac (key "act") luon dung DAU bang va ghim trai - bang nhieu cot khong bi day nut ra khoi man hinh.
 * totalRow (theo vi tri cot khai bao) duoc doi cho theo.
 */
export function DataTable<T>({
  cols: colsIn, rows: rowsIn, keyOf, totalRow: totalRowIn, empty = "Không có dữ liệu", onRowClick, minWidth, pageSize, timKiem = true,
}: {
  cols: Col<T>[];
  rows: T[];
  keyOf: (row: T, i: number) => string | number;
  totalRow?: ReactNode[];
  empty?: string;
  onRowClick?: (row: T) => void;
  minWidth?: number;
  /** Bat phan trang client-side (mac dinh 10). Truyen 0/undefined de tat. */
  pageSize?: number;
  /** O tim nhanh trong bang (khong dau, moi cot). Mac dinh bat; tat (false) khi trang da co o tim rieng / tim phia server. */
  timKiem?: boolean;
}) {
  const [q, setQ] = useState("");
  const tu = boDau(q).split(/\s+/).filter(Boolean);
  const rows = tu.length ? rowsIn.filter((r) => { const h = chuoiTim(r); return tu.every((x) => h.includes(x)); }) : rowsIn;
  const coTim = timKiem && (rowsIn.length >= 6 || q !== "");
  const ai = colsIn.findIndex((c) => c.key === "act");
  const order = ai > 0 ? [ai, ...colsIn.map((_, i) => i).filter((i) => i !== ai)] : colsIn.map((_, i) => i);
  const cols = order.map((i) => (i === ai ? { ...colsIn[i], sticky: true, align: "left" as const, header: colsIn[i].header || "Thao tác", wrap: true } : colsIn[i]));
  const totalRow = totalRowIn && totalRowIn.length === colsIn.length ? order.map((i) => totalRowIn[i]) : totalRowIn;
  const size = pageSize ?? 0;
  const [page, setPage] = useState(0);
  const total = rows.length;
  const start = size > 0 ? page * size : 0;
  const shown = size > 0 ? rows.slice(start, start + size) : rows;
  // clamp khi rows doi (vd sau khi loc)
  if (size > 0 && page > 0 && start >= total) setPage(0);

  return (
    <>
      {coTim && (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginBottom: 8 }}>
          {q && <span className="muted" style={{ fontSize: 12 }}>{rows.length} / {rowsIn.length} dòng</span>}
          <input className="input" style={{ width: 260, height: 32 }} placeholder="🔍 Tìm nhanh trong bảng (không dấu)…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        </div>
      )}
      <div className="tbl-wrap">
        <table className="tbl" style={minWidth ? { minWidth } : undefined}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} style={{ textAlign: c.align ?? "left", width: c.width,
                  position: c.sticky ? "sticky" : undefined, left: c.sticky ? 0 : undefined, zIndex: c.sticky ? 2 : undefined,
                  background: c.sticky ? "var(--panel-2)" : undefined }}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {totalRow && (
              <tr className="total-row">
                {totalRow.map((v, i) => (
                  <td key={i} style={{ textAlign: cols[i]?.align ?? "left" }}>{v}</td>
                ))}
              </tr>
            )}
            {shown.length === 0 && (
              <tr><td colSpan={cols.length} className="muted" style={{ textAlign: "center", padding: "40px 12px" }}>{empty}</td></tr>
            )}
            {shown.map((row, i) => (
              <tr key={keyOf(row, start + i)} onClick={onRowClick ? () => onRowClick(row) : undefined} style={{ cursor: onRowClick ? "pointer" : undefined }}>
                {cols.map((c) => (
                  <td key={c.key} style={{ textAlign: c.align ?? "left",
                    position: c.sticky ? "sticky" : undefined, left: c.sticky ? 0 : undefined, background: c.sticky ? "#fff" : undefined, zIndex: c.sticky ? 1 : undefined,
                    whiteSpace: c.key === "act" ? "nowrap" : undefined, boxShadow: c.key === "act" ? "6px 0 6px -6px rgba(15,23,42,.18)" : undefined }}>
                    {c.wrap || c.align === "right" || c.align === "center" ? c.render(row) : <Clip w={c.maxW ?? c.width ?? 240}>{c.render(row)}</Clip>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {size > 0 && total > size && (
        <SimplePager total={total} size={size} page={page} onPage={setPage} />
      )}
    </>
  );
}

function SimplePager({ total, size, page, onPage }: { total: number; size: number; page: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const cur = page + 1;
  const nums: (number | "...")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p <= 2 || p > pages - 1 || Math.abs(p - cur) <= 1) nums.push(p);
    else if (nums[nums.length - 1] !== "...") nums.push("...");
  }
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, flexWrap: "wrap", gap: 10 }}>
      <div className="muted" style={{ fontSize: 12.5 }}>
        Hiển thị {page * size + 1}–{Math.min((page + 1) * size, total)} / {total.toLocaleString("vi-VN")}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button className="btn ghost sm" disabled={cur === 1} onClick={() => onPage(0)}>«</button>
        <button className="btn ghost sm" disabled={cur === 1} onClick={() => onPage(page - 1)}>‹</button>
        {nums.map((n, i) => n === "..." ? <span key={i} className="muted" style={{ padding: "0 4px" }}>…</span> : (
          <button key={i} className={`btn sm ${n === cur ? "primary" : "ghost"}`} onClick={() => onPage(n - 1)}>{n}</button>
        ))}
        <button className="btn ghost sm" disabled={cur === pages} onClick={() => onPage(page + 1)}>›</button>
        <button className="btn ghost sm" disabled={cur === pages} onClick={() => onPage(pages - 1)}>»</button>
      </div>
    </div>
  );
}

/** Phan trang SERVER-side (EoList) — giu API cu. */
export function Pagination({
  total, limit, offset, onPage,
}: {
  total: number; limit: number; offset: number;
  onPage: (offset: number) => void;
  pageSize?: number; onPageSize?: (n: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const cur = Math.floor(offset / limit) + 1;
  const nums: (number | "...")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p <= 3 || p > pages - 1 || Math.abs(p - cur) <= 1) nums.push(p);
    else if (nums[nums.length - 1] !== "...") nums.push("...");
  }
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, flexWrap: "wrap", gap: 10 }}>
      <div className="muted" style={{ fontSize: 12.5 }}>
        Hiển thị {total === 0 ? 0 : offset + 1}–{Math.min(offset + limit, total)} / {total.toLocaleString("vi-VN")} kết quả
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button className="btn ghost sm" disabled={cur === 1} onClick={() => onPage(0)}>«</button>
        <button className="btn ghost sm" disabled={cur === 1} onClick={() => onPage((cur - 2) * limit)}>‹</button>
        {nums.map((n, i) => n === "..." ? <span key={i} className="muted" style={{ padding: "0 4px" }}>…</span> : (
          <button key={i} className={`btn sm ${n === cur ? "primary" : "ghost"}`} onClick={() => onPage((n - 1) * limit)}>{n}</button>
        ))}
        <button className="btn ghost sm" disabled={cur === pages} onClick={() => onPage(cur * limit)}>›</button>
        <button className="btn ghost sm" disabled={cur === pages} onClick={() => onPage((pages - 1) * limit)}>»</button>
      </div>
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>{children}</div>;
}

export const RefreshFiltersBtn = ({ onClick }: { onClick: () => void }) => (
  <button className="btn ghost sm" style={{ color: "var(--text-muted)" }} onClick={onClick}><I.refresh width={14} height={14} /> Xóa lọc</button>
);
