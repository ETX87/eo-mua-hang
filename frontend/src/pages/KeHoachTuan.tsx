import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { PageHeader, Card, Spinner } from "../components/ui";
import { PlanImportModal } from "../components/PlanImportModal";
import { I } from "../lib/icons";
import { soLuong, ngay } from "../lib/format";
import { nextWeeks, todayISO, weekSat, weekStartOf } from "../lib/excel";
import { maPO, parseWeeklyFile, weeklyTemplate, type Parsed, type PlanLine } from "../lib/planExcel";

/**
 * Ke hoach hang ve THEO TUAN - danh cho don ke hoach thang cua KRF: moi linh kien chia SL theo tuan
 * (CN-T7, nhan Yyy-Wnn). Tach rieng khoi ke hoach theo ngay (item_plan.loai = 'TUAN'); bao cao tien do
 * tinh moc tuan vao ngay Thu Bay.
 */
export default function KeHoachTuan() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [eoId, setEoId] = useState<number | null>(null);
  const [imp, setImp] = useState<{ name: string; parsed: Parsed } | null>(null);
  const [msg, setMsg] = useState("");
  const [busyTpl, setBusyTpl] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const eos = useQuery({
    queryKey: ["eo-issued", search],
    queryFn: () => api.get<{ rows: any[] }>(`/eo?trang_thai=ISSUED&limit=50&q=${encodeURIComponent(search.trim())}`),
  });
  const data = useQuery({
    queryKey: ["plan-tuan-eo", eoId],
    queryFn: () => api.get<{ lines: PlanLine[]; plans: any[] }>(`/plans/lines?eo_id=${eoId}&loai=TUAN`),
    enabled: !!eoId,
  });

  const downloadTemplate = async () => {
    setBusyTpl(true);
    try {
      if (eoId && data.data) {
        const weeks = weeksOf(data.data.plans, []);
        const eo = data.data.lines[0];
        weeklyTemplate(data.data.lines, data.data.plans, weeks, `Ke_hoach_tuan_${eo ? maPO(eo) : eoId}.xlsx`);
      } else {
        const r = await api.get<{ lines: PlanLine[] }>("/plans/lines?loai=TUAN&con_lai=1");
        weeklyTemplate(r.lines, [], nextWeeks(todayISO(), 8), "Ke_hoach_tuan_cac_dong_con_thieu.xlsx");
      }
    } finally { setBusyTpl(false); }
  };
  const onFile = async (f: File) => {
    setMsg("");
    try { setImp({ name: f.name, parsed: await parseWeeklyFile(f) }); } catch { setMsg("Không đọc được file Excel."); }
  };

  return (
    <div>
      <PageHeader title="Kế hoạch tuần (đơn KH tháng KRF)" back={() => nav("/plans")} breadcrumb={["Kế hoạch hàng về", "Kế hoạch tuần"]}
        actions={<>
          <button className="btn primary" onClick={() => fileRef.current?.click()}><I.upload width={14} height={14} /> Import Excel</button>
          <button className="btn" disabled={busyTpl} onClick={downloadTemplate}>
            <I.download width={14} height={14} /> {busyTpl ? "Đang tạo..." : eoId ? "Tải mẫu EO đang chọn" : "Tải mẫu (dòng còn thiếu KH)"}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
        </>} />
      {msg && <div style={{ background: "#DCFCE7", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, alignItems: "start" }}>
        <Card>
          <input className="input" placeholder="Tìm mã EO / 3TDO / tiêu đề..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <div style={{ marginTop: 10, maxHeight: "65vh", overflow: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {eos.isLoading && <Spinner />}
            {(eos.data?.rows ?? []).map((e) => (
              <button key={e.id} onClick={() => setEoId(e.id)} className="btn ghost" style={{
                justifyContent: "flex-start", textAlign: "left", height: "auto", padding: "8px 10px", display: "block",
                background: e.id === eoId ? "var(--brand-yellow-soft, #FEF3C7)" : undefined,
              }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{e.approval_code || e.eo_code} <span className="muted" style={{ fontWeight: 400 }}>· {e.eo_code}</span></div>
                <div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.tieu_de || "(không tiêu đề)"} · {e.so_dong} dòng</div>
              </button>
            ))}
            {eos.data && !eos.data.rows.length && <div className="muted" style={{ fontSize: 13 }}>Không có EO đã ban hành khớp.</div>}
          </div>
        </Card>
        <div>
          {!eoId && (
            <Card>
              <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                <b>Cách dùng</b>
                <ol style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  <li>Chọn EO (đơn kế hoạch tháng) ở cột trái → nhập SL dự kiến về theo từng tuần → Lưu.</li>
                  <li>Hoặc cập nhật nhiều EO 1 lần: "Tải mẫu" → điền SL vào các cột tuần (Y26-W42…) → "Import Excel".</li>
                  <li>Mỗi lần lưu / import sẽ <b>thay</b> kế hoạch tuần cũ của các linh kiện được cập nhật; lịch sử thay đổi vẫn giữ trong EO.</li>
                </ol>
                <div className="muted" style={{ marginTop: 8 }}>Kế hoạch tuần tách riêng với kế hoạch theo ngày (Chi tiết EO › Kế hoạch hàng về), nhưng cả hai cùng tính vào tổng không vượt SL đặt và vào báo cáo tiến độ.</div>
              </div>
            </Card>
          )}
          {eoId && data.isLoading && <Spinner />}
          {eoId && data.data && (
            <WeekGrid key={eoId} eoId={eoId} lines={data.data.lines} plans={data.data.plans}
              onSaved={(n) => { setMsg(`Đã lưu kế hoạch tuần cho ${n} linh kiện.`); qc.invalidateQueries({ queryKey: ["plan-tuan-eo", eoId] }); qc.invalidateQueries({ queryKey: ["eo", String(eoId)] }); }} />
          )}
        </div>
      </div>

      {imp && (
        <PlanImportModal loai="TUAN" fileName={imp.name} parsed={imp.parsed} onClose={() => setImp(null)}
          onDone={(s) => {
            setImp(null);
            setMsg(`Import xong: ${s.so_ghi} ô tuần cho ${s.so_dong_lk} linh kiện${s.so_ke_hoach_cu_thay ? `, thay ${s.so_ke_hoach_cu_thay} mốc tuần cũ` : ""}.`);
            qc.invalidateQueries({ queryKey: ["plan-tuan-eo"] });
          }} />
      )}
    </div>
  );
}

function weeksOf(plans: any[], extra: string[]): string[] {
  const set = new Set<string>([...plans.map((p) => p.tuan).filter(Boolean), ...extra]);
  if (!set.size) nextWeeks(todayISO(), 6).forEach((w) => set.add(w));
  return [...set].sort((a, b) => weekSat(a).localeCompare(weekSat(b)));
}

function WeekGrid({ eoId, lines, plans, onSaved }: { eoId: number; lines: PlanLine[]; plans: any[]; onSaved: (n: number) => void }) {
  const nav = useNavigate();
  const orig = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of plans) if (p.tuan) m[`${p.eo_item_id}|${p.tuan}`] = String((Number(m[`${p.eo_item_id}|${p.tuan}`]) || 0) + p.planned_qty);
    return m;
  }, [plans]);
  const [cells, setCells] = useState<Record<string, string>>(orig);
  const [extra, setExtra] = useState<string[]>([]);
  const [errs, setErrs] = useState<Record<number, string>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setCells(orig), [orig]);

  const weeks = weeksOf(plans, extra);
  const addWeek = () => {
    const last = weeks[weeks.length - 1];
    const nx = nextWeeks(last ? weekSat(last) : todayISO(), 2)[last ? 1 : 0];
    setExtra((x) => [...x, nx]);
  };
  const num = (v?: string) => Number(String(v ?? "").replace(",", ".")) || 0;
  const tongTuan = (id: number) => weeks.reduce((s, w) => s + num(cells[`${id}|${w}`]), 0);
  const khNgay = (l: PlanLine) => l.da_len_kh - l.da_len_kh_loai;
  const dirty = lines.filter((l) => weeks.some((w) => (cells[`${l.id}|${w}`] ?? "") !== (orig[`${l.id}|${w}`] ?? "")));

  const save = async () => {
    setErr(""); setErrs({});
    const e: Record<number, string> = {};
    for (const l of dirty) {
      if (weeks.some((w) => { const v = cells[`${l.id}|${w}`]; return v && (Number.isNaN(Number(v.replace(",", "."))) || num(v) < 0); })) e[l.id] = "Ô không phải số";
      else if (tongTuan(l.id) + khNgay(l) > l.current_qty + 1e-9) e[l.id] = `Tổng KH ${soLuong(tongTuan(l.id) + khNgay(l))} > SL đặt`;
    }
    if (Object.keys(e).length) { setErrs(e); return setErr("Có dòng chưa hợp lệ (tô đỏ)."); }
    if (!dirty.length) return setErr("Chưa có thay đổi.");
    const rows = dirty.flatMap((l) => {
      const ws = weeks.filter((w) => num(cells[`${l.id}|${w}`]) > 0);
      return ws.length ? ws.map((w) => ({ eo_item_id: l.id, tuan: w, planned_qty: num(cells[`${l.id}|${w}`]) })) : [{ eo_item_id: l.id, tuan: weeks[0], planned_qty: 0 }];
    });
    setBusy(true);
    try {
      await api.post("/plans/bulk", { loai: "TUAN", thay_the: true, nguon: "man_hinh", rows });
      setExtra([]);
      onSaved(dirty.length);
    } catch (ex: any) {
      const srv: Record<number, string> = {};
      for (const r of ex?.body?.rows ?? []) if (!r.ok && r.eo_item_id) srv[r.eo_item_id] = r.error_text;
      setErrs(srv);
      setErr(Object.keys(srv).length ? "Máy chủ từ chối một số dòng (tô đỏ) — chưa ghi gì." : "Lỗi lưu kế hoạch tuần.");
    } finally { setBusy(false); }
  };

  if (!lines.length) return <Card><div className="muted">EO không có dòng linh kiện đang hiệu lực.</div></Card>;
  const po = maPO(lines[0]);
  const th = { position: "sticky" as const, top: 0, background: "var(--surface, #fff)", zIndex: 1 };
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>{po}</b>
        <button className="btn ghost sm" onClick={() => nav(`/eo/${eoId}`)}><I.eye width={14} height={14} /> Mở EO</button>
        <span className="muted" style={{ fontSize: 12.5 }}>{lines.length} dòng · {dirty.length} dòng đã sửa</span>
        <button className="btn sm" style={{ marginLeft: "auto" }} onClick={addWeek}><I.plus width={14} height={14} /> Thêm tuần</button>
        <button className="btn sm" disabled={!dirty.length} onClick={() => { setCells(orig); setExtra([]); setErrs({}); }}>Hoàn tác</button>
        <button className="btn sm primary" disabled={busy || !dirty.length} onClick={save}>{busy ? "Đang lưu..." : `Lưu (${dirty.length})`}</button>
      </div>
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginBottom: 8 }}>{err}</div>}
      <div className="tbl-wrap" style={{ maxHeight: "62vh", overflow: "auto" }}>
        <table className="tbl">
          <thead><tr>
            <th style={th}>Mã LK</th><th style={th}>Tên linh kiện</th><th style={th}>Kho</th>
            <th style={{ ...th, textAlign: "right" }}>SL đặt</th><th style={{ ...th, textAlign: "right" }}>Đã về</th><th style={{ ...th, textAlign: "right" }} title="Kế hoạch theo ngày (nhập ở Chi tiết EO)">KH ngày</th>
            {weeks.map((w) => (
              <th key={w} style={{ ...th, textAlign: "center", minWidth: 78 }}>
                {w}<div className="muted" style={{ fontWeight: 400, fontSize: 10.5 }}>{ngay(weekStartOf(weekSat(w))).slice(0, 5)}–{ngay(weekSat(w)).slice(0, 5)}</div>
              </th>
            ))}
            <th style={{ ...th, textAlign: "right" }}>Tổng tuần</th><th style={{ ...th, textAlign: "right" }}>Chưa lên KH</th>
          </tr></thead>
          <tbody>
            {lines.map((l) => {
              const tt = tongTuan(l.id);
              const thieu = l.current_qty - khNgay(l) - tt;
              const e = errs[l.id];
              return (
                <tr key={l.id} style={{ background: e ? "#FEF2F2" : undefined }} title={e}>
                  <td><b>{l.part_code}</b>{l.part_code_goc && <div className="muted" style={{ fontSize: 11 }}>thay từ {l.part_code_goc}</div>}</td>
                  <td style={{ maxWidth: 220 }}>{l.part_name}{l.ghi_chu && <div className="muted" style={{ fontSize: 11 }}>Ghi chú: {l.ghi_chu}</div>}</td>
                  <td>{l.warehouse}</td>
                  <td style={{ textAlign: "right" }}>{soLuong(l.current_qty)}</td>
                  <td style={{ textAlign: "right" }}>{soLuong(l.da_ve)}</td>
                  <td style={{ textAlign: "right" }}>{soLuong(khNgay(l))}</td>
                  {weeks.map((w) => {
                    const k = `${l.id}|${w}`;
                    const changed = (cells[k] ?? "") !== (orig[k] ?? "");
                    return (
                      <td key={w} style={{ padding: 3 }}>
                        <input className="input right" style={{ width: 72, background: changed ? "#FEF9C3" : undefined }} value={cells[k] ?? ""}
                          onChange={(ev) => setCells((c) => ({ ...c, [k]: ev.target.value.trim() }))} />
                      </td>
                    );
                  })}
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{soLuong(tt)}</td>
                  <td style={{ textAlign: "right", color: thieu < 0 ? "var(--danger)" : undefined }}>{soLuong(thieu)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Ô trống = không có kế hoạch tuần đó. Lưu sẽ thay toàn bộ kế hoạch tuần của các dòng đã sửa. Ô vàng = đã sửa, chưa lưu.
      </div>
    </Card>
  );
}
