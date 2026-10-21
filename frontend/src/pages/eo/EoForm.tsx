import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { PageHeader, Spinner } from "../../components/ui";
import { type Col } from "../../components/DataTable";
import { I } from "../../lib/icons";
import { soLuong, ten } from "../../lib/format";
import { PHONG_BAN, KHO_THEO_PHONG_BAN } from "../../lib/nav";
import { readSheet, pick, str, parseNum, normKey, writeBook } from "../../lib/excel";
import { FILE_ACCEPT, checkFile, fileSize, uploadEoFiles } from "../../lib/files";

interface ItemRow {
  id?: number; part_code: string; part_name: string; warehouse: string; supplier: string;
  current_qty: string; reason: string; ghi_chu: string;
  /** ID CRM = ma ca bao hanh (tuy chon) - DVBH khop PO ve dung ca; ID dat hang = ma don linh-kien-app (TLK-...). */
  crm_id: string; order_id: string;
}
const emptyItem = (): ItemRow => ({ part_code: "", part_name: "", warehouse: "", supplier: "", current_qty: "", reason: "", ghi_chu: "", crm_id: "", order_id: "" });

export default function EoForm({ mode }: { mode: "create" | "edit" }) {
  const nav = useNavigate();
  const { id } = useParams();
  const cats = useQuery({ queryKey: ["dm-loaihinh"], queryFn: () => api.get<any[]>("/danh-muc/loai-hinh") });
  const khos = useQuery({ queryKey: ["dm-kho"], queryFn: () => api.get<any[]>("/danh-muc/kho") });
  const users = useQuery({ queryKey: ["users-min"], queryFn: () => api.get<any[]>("/users/directory") });
  const eoQ = useQuery({
    queryKey: ["eo", id],
    queryFn: () => api.get<any>(`/eo/${id}`),
    enabled: mode === "edit" && !!id,
  });

  const [loaded, setLoaded] = useState(mode === "create");
  const [tieuDe, setTieuDe] = useState("");
  const [loaiHinh, setLoaiHinh] = useState("");
  const [phongBan, setPhongBan] = useState("");
  const [noiDung, setNoiDung] = useState("");
  const [items, setItems] = useState<ItemRow[]>([emptyItem(), emptyItem()]);
  const [originalItems, setOriginalItems] = useState<Record<number, ItemRow>>({});
  const [reviewers, setReviewers] = useState<string[]>([]);
  const [finalApprover, setFinalApprover] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [importMsg, setImportMsg] = useState<{ ok: number; errs: string[] } | null>(null);
  const [importedFromExcel, setImportedFromExcel] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileErrs, setFileErrs] = useState<string[]>([]);
  const [deletedFileIds, setDeletedFileIds] = useState<number[]>([]);
  const importRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode !== "edit" || loaded || !eoQ.data) return;
    const { eo, items: srvItems, approvals } = eoQ.data;
    setTieuDe(eo.tieu_de || "");
    setLoaiHinh(eo.loai_hinh || "");
    setPhongBan(eo.phong_ban || "");
    setNoiDung(eo.noi_dung || "");
    setFinalApprover(eo.final_approver_email || "");
    const rows: ItemRow[] = (srvItems ?? []).map((it: any) => ({
      id: it.id, part_code: it.part_code, part_name: it.part_name || "", warehouse: it.warehouse,
      supplier: it.supplier || "", current_qty: String(it.current_qty ?? ""), reason: it.reason || "",
      ghi_chu: it.ghi_chu || "", crm_id: it.crm_id || "", order_id: it.order_id || "",
    }));
    setItems(rows.length ? rows : [emptyItem(), emptyItem()]);
    setOriginalItems(Object.fromEntries(rows.filter((r) => r.id != null).map((r) => [r.id as number, r])));
    const revs = [...new Set(
      (approvals ?? [])
        .filter((a: any) => a.submission_id === eo.current_submission_id && a.step_type === "REVIEW")
        .map((a: any) => a.approver_email as string),
    )] as string[];
    setReviewers(revs);
    setLoaded(true);
  }, [mode, loaded, eoQ.data]);

  // Phong ban Kho van MB/MN -> kho co dinh cho moi dong MOI (dong da luu giu kho cu)
  const khoMacDinh = KHO_THEO_PHONG_BAN[phongBan] ?? "";
  const whOf = (r: ItemRow) => (r.id == null && khoMacDinh ? khoMacDinh : r.warehouse);

  const setItem = (i: number, k: keyof ItemRow, v: string) =>
    setItems((rows) => rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const tongSL = items.reduce((s, r) => s + (Number(r.current_qty) || 0), 0);

  const userOpts = (users.data ?? []).map((u: any) => u.email);
  const noReviewer = reviewers.length === 0;
  const tenNguoi = (email: string) => { const x = (users.data ?? []).find((u: any) => u.email === email); return x?.ho_ten ? `${x.ho_ten} — ${email}` : email; };

  const payloadItems = () =>
    items.filter((r) => r.part_code.trim() && whOf(r)).map((r) => ({
      part_code: r.part_code.trim(), part_name: r.part_name.trim(), warehouse: whOf(r),
      supplier: r.supplier.trim() || undefined, current_qty: Number(r.current_qty) || 0,
      reason: r.reason.trim() || undefined, ghi_chu: r.ghi_chu.trim() || undefined,
      crm_id: r.crm_id.trim() || undefined, order_id: r.order_id.trim() || undefined,
    }));

  const submitCreate = async (send: boolean) => {
    const its = payloadItems();
    const res = await api.post<{ id: number }>("/eo", {
      tieu_de: tieuDe, noi_dung: noiDung, loai_hinh: loaiHinh || undefined, phong_ban: phongBan || undefined,
      final_approver_email: finalApprover, items: its, nguon_dong: importedFromExcel ? "excel" : undefined,
    });
    await uploadPending(res.id);
    if (send) {
      try {
        await api.post(`/eo/${res.id}/submit`, { reviewers, final_approver_email: finalApprover });
      } catch {
        // nhap da tao - chuyen sang man sua de tranh bam lai tao EO trung
        alert("Đã lưu nháp nhưng gửi trình duyệt thất bại — kiểm tra lại thông tin rồi gửi lại.");
        nav(`/eo/${res.id}/edit`, { replace: true });
        return;
      }
    }
    nav(`/eo/${res.id}`);
  };

  const submitEdit = async (send: boolean) => {
    await api.patch(`/eo/${id}`, {
      tieu_de: tieuDe, noi_dung: noiDung, loai_hinh: loaiHinh || null, phong_ban: phongBan || null,
      final_approver_email: finalApprover,
    });

    // dong moi (go tay / import Excel) gui 1 lan
    const newRows = items.filter((r) => r.id == null && r.part_code.trim() && whOf(r)).map((r) => ({
      part_code: r.part_code.trim(), part_name: r.part_name.trim(), warehouse: whOf(r),
      supplier: r.supplier.trim() || undefined, current_qty: Number(r.current_qty) || 0,
      reason: r.reason.trim() || undefined, ghi_chu: r.ghi_chu.trim() || undefined,
      crm_id: r.crm_id.trim() || undefined, order_id: r.order_id.trim() || undefined,
    }));
    if (newRows.length) await api.post(`/eo/${id}/items`, { items: newRows });
    for (const r of items) {
      if (r.id != null) {
        const orig = originalItems[r.id];
        const patch: Record<string, unknown> = {};
        const qty = Number(r.current_qty) || 0;
        if (orig && qty !== Number(orig.current_qty)) patch.current_qty = qty;
        if (orig && r.part_name.trim() !== orig.part_name) patch.part_name = r.part_name.trim();
        if (orig && r.supplier.trim() !== orig.supplier) patch.supplier = r.supplier.trim() || null;
        if (orig && r.ghi_chu.trim() !== orig.ghi_chu) patch.ghi_chu = r.ghi_chu.trim() || null;
        if (orig && r.crm_id.trim() !== orig.crm_id) patch.crm_id = r.crm_id.trim() || null;
        if (orig && r.order_id.trim() !== orig.order_id) patch.order_id = r.order_id.trim() || null;
        if (Object.keys(patch).length) await api.patch(`/eo/items/${r.id}`, patch);
      }
    }
    for (const oid of Object.keys(originalItems).map(Number)) {
      if (!items.some((r) => r.id === oid)) await api.patch(`/eo/items/${oid}`, { current_qty: 0 });
    }

    await uploadPending(id!);
    if (send) await api.post(`/eo/${id}/submit`, { reviewers, final_approver_email: finalApprover });
    nav(`/eo/${id}`);
  };

  // tai lieu chon o form: upload sau khi EO co id, TRUOC khi gui trinh (nguoi duyet thay ngay)
  const uploadPending = async (eoId: number | string) => {
    if (!pendingFiles.length) return;
    const errs = await uploadEoFiles(eoId, pendingFiles);
    setPendingFiles([]);
    if (errs.length) alert(`EO đã lưu nhưng ${errs.length} tệp đính kèm chưa tải lên được:\n- ${errs.join("\n- ")}\n\nCó thể tải lại ở Chi tiết EO › tab "Tài liệu đính kèm".`);
  };
  // xoa tep DA tai len (che do Sua) - xoa mem phia server, ghi lich su EO
  const deleteSavedFile = async (f: any) => {
    if (!confirm(`Xóa tệp đính kèm "${f.file_name}"?`)) return;
    try {
      await api.del(`/eo/${id}/files/${f.id}`);
      setDeletedFileIds((ids) => [...ids, f.id]);
    } catch (e: any) {
      setFileErrs([e?.body?.error === "FORBIDDEN" ? "Bạn không có quyền xóa tệp này." : e?.body?.error === "ADMIN_ONLY_AFTER_ISSUE" ? "EO đã ban hành — chỉ Admin được xóa tệp." : "Lỗi xóa tệp."]);
    }
  };
  const onPickFiles = (list: FileList | null) => {
    const fs = [...(list ?? [])];
    setFileErrs(fs.map(checkFile).filter(Boolean) as string[]);
    setPendingFiles((cur) => [...cur, ...fs.filter((f) => !checkFile(f) && !cur.some((c) => c.name === f.name && c.size === f.size))]);
  };

  // ---- import dong linh kien tu Excel (file mau)
  const downloadTemplate = () => {
    const kho = (khos.data ?? []).filter((k: any) => k.active !== 0);
    writeBook("Mau_import_linh_kien_EO.xlsx", [
      {
        name: "Linh kien",
        rows: [
          ["Mã linh kiện", "Tên linh kiện", "Kho cần đặt", "Đối tác", "Số lượng", "Lý do PS", "Ghi chú", "ID CRM (mã ca)", "ID đặt hàng"],
          ["VD-LK-001", "Dòng ví dụ - mã bắt đầu bằng VD- sẽ được bỏ qua", kho[0]?.ten_kho ?? "", "KRF", 10, "Bảo hành", "Giao trước 25/10", "T21689", ""],
        ],
        widths: [18, 40, 24, 16, 10, 26, 30, 16, 16],
      },
      { name: "Danh sach kho", rows: [["Tên kho (ghi đúng vào cột Kho cần đặt)", "Mã kho"], ...kho.map((k: any) => [k.ten_kho, k.ma_kho ?? ""])], widths: [40, 12] },
    ]);
  };
  const onImportFile = async (file: File) => {
    setImportMsg(null);
    let rows: Record<string, unknown>[] = [];
    try { rows = (await readSheet(file)).rows; } catch { setImportMsg({ ok: 0, errs: ["Không đọc được file Excel."] }); return; }
    const khoMap = new Map<string, string>();
    for (const k of khos.data ?? []) {
      khoMap.set(normKey(k.ten_kho), k.ten_kho);
      if (k.ma_kho) khoMap.set(normKey(k.ma_kho), k.ten_kho);
    }
    const ok: ItemRow[] = [];
    const errs: string[] = [];
    for (const r of rows) {
      const pc = str(pick(r, "Mã linh kiện", "Mã LK", "Mã hàng", "Part code"));
      const khoRaw = str(pick(r, "Kho cần đặt", "Kho"));
      const qty = parseNum(pick(r, "Số lượng", "SL", "Số lượng đặt"));
      if (!pc) { errs.push(`Dòng ${r._row}: thiếu Mã linh kiện`); continue; }
      if (/^VD-/i.test(pc)) continue; // dong vi du trong file mau
      const kho = khoMacDinh || khoMap.get(normKey(khoRaw));
      if (!kho) { errs.push(`Dòng ${r._row} (${pc}): kho "${khoRaw}" không có trong danh mục`); continue; }
      if (qty == null || !(qty > 0)) { errs.push(`Dòng ${r._row} (${pc}): số lượng không hợp lệ`); continue; }
      ok.push({
        part_code: pc, part_name: str(pick(r, "Tên linh kiện", "Tên LK", "Tên hàng")), warehouse: kho,
        supplier: str(pick(r, "Đối tác", "Nhà cung cấp", "NCC")), current_qty: String(qty), reason: str(pick(r, "Lý do PS", "Lý do")),
        ghi_chu: str(pick(r, "Ghi chú", "Ghi chú dòng", "Note")),
        crm_id: str(pick(r, "ID CRM (mã ca)", "ID CRM", "Mã ca")), order_id: str(pick(r, "ID đặt hàng", "Mã đơn đặt hàng")),
      });
    }
    if (ok.length) {
      setItems((rs) => [...rs.filter((x) => x.id != null || x.part_code.trim() || x.current_qty.trim()), ...ok]);
      setImportedFromExcel(true);
    }
    setImportMsg({ ok: ok.length, errs });
  };

  const submit = async (send: boolean) => {
    setErr("");
    const its = payloadItems();
    if (!tieuDe.trim()) return setErr("Nhập tiêu đề.");
    if (its.length === 0) return setErr("EO phải có ít nhất 1 dòng linh kiện.");
    if (!finalApprover) return setErr("Chọn người duyệt cuối.");
    if (send) {
      if (!loaiHinh) return setErr(cats.data?.length ? "Chọn loại hình." : "Chưa có danh mục Loại hình EO — Admin cần thêm ở Cài đặt › Danh mục.");
      if (!phongBan) return setErr("Chọn phòng ban.");
      if (!noiDung.trim()) return setErr("Nhập nội dung / lý do trình.");
    }
    setBusy(true);
    try {
      if (mode === "create") await submitCreate(send);
      else await submitEdit(send);
    } catch (e: any) {
      const code = e?.body?.error;
      setErr(code === "MISSING_REQUIRED_FIELDS" ? "Thiếu Loại hình / Phòng ban / Nội dung — bổ sung rồi gửi lại." : code || "Lỗi lưu EO.");
      setBusy(false);
    }
  };

  const itemCols: Col<ItemRow>[] = [
    { key: "stt", header: "#", align: "center", width: 36, render: () => "" },
    { key: "pc", header: <>Mã linh kiện <span className="req">*</span></>, width: 150, render: (_r) => null },
    { key: "pn", header: "Tên linh kiện", width: 260, render: () => null },
    { key: "wh", header: <>Kho cần đặt <span className="req">*</span></>, width: 230, render: () => null },
    { key: "sp", header: "Đối tác", width: 140, render: () => null },
    { key: "qty", header: <>SL <span className="req">*</span></>, align: "right", width: 84, render: () => null },
    { key: "rs", header: "Lý do PS", width: 170, render: () => null },
    { key: "gc", header: "Ghi chú", width: 190, render: () => null },
    { key: "crm", header: <span title="Mã ca bảo hành (tuỳ chọn) - app DVBH dùng để gắn PO vào đúng ca">ID CRM</span>, width: 110, render: () => null },
    { key: "od", header: <span title="Mã đơn đặt linh kiện (TLK-...) - tuỳ chọn">ID đặt hàng</span>, width: 120, render: () => null },
    { key: "act", header: "", align: "center", width: 40, render: () => null },
  ];

  if (mode === "edit" && (!loaded || eoQ.isLoading)) return <Spinner />;
  if (mode === "edit" && eoQ.isError) return <div className="muted">Không tìm thấy EO.</div>;

  return (
    <div>
      <PageHeader
        title={mode === "create" ? "Tạo mới EO" : "Sửa EO"} back={() => nav(-1)}
        breadcrumb={["Danh sách EO", mode === "create" ? "Tạo mới EO" : "Sửa EO"]}
        actions={<>
          <button className="btn" disabled={busy} onClick={() => submit(false)}>Lưu nháp</button>
          <button className="btn primary" disabled={busy} onClick={() => submit(true)}><I.refresh width={14} height={14} /> Gửi trình duyệt</button>
          <button className="btn" onClick={() => nav(-1)}>Hủy</button>
        </>}
      />

      {noReviewer && (
        <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 16, color: "#92400E" }}>
          Không chọn thẩm định → gửi thẳng người duyệt cuối.
        </div>
      )}
      {err && <div style={{ color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>{err}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card card-pad">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>1. Thông tin chung</h3>
          <div className="eo-form-info">
          <div style={{ gridColumn: "span 2" }}>
          <label className="field-label">Tiêu đề <span className="req">*</span></label>
          <input className="input" placeholder="Nhập tiêu đề..." value={tieuDe} onChange={(e) => setTieuDe(e.target.value)} />
          </div>
          <div>
          <label className="field-label">Loại hình <span className="req">*</span></label>
          <select className="select" value={loaiHinh} onChange={(e) => setLoaiHinh(e.target.value)}>
            <option value="">Chọn loại hình</option>
            {loaiHinh && !(cats.data ?? []).some((c) => c.code === loaiHinh) && <option value={loaiHinh}>{loaiHinh}</option>}
            {(cats.data ?? []).map((c) => <option key={c.code} value={c.code}>{c.ten && c.ten !== c.code ? `${c.code} — ${c.ten}` : c.code}</option>)}
          </select>
          {cats.data && cats.data.length === 0 && (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Chưa có danh mục Loại hình — Admin thêm ở Cài đặt › Danh mục.</div>
          )}
          </div>
          <div>
          <label className="field-label">Phòng ban <span className="req">*</span></label>
          <select className="select" value={phongBan} onChange={(e) => setPhongBan(e.target.value)}>
            <option value="">Chọn phòng ban</option>
            {[...new Set([...PHONG_BAN, ...(phongBan ? [phongBan] : [])])].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          {khoMacDinh && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Dòng linh kiện mới tự đặt kho <b>{khoMacDinh}</b> — không cần chọn kho.</div>}
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
          <label className="field-label">Nội dung / lý do trình <span className="req">*</span></label>
          <textarea className="textarea" style={{ minHeight: 64 }} placeholder="Nhập nội dung / lý do trình..." value={noiDung} onChange={(e) => setNoiDung(e.target.value)} />
          </div>
          </div>
        </div>

        <div>
          <div className="card card-pad">
            <h3 style={{ marginTop: 0, fontSize: 15 }}>2. Danh sách linh kiện</h3>
            {mode === "edit" && (
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                Dòng đã lưu chỉ sửa được số lượng / tên linh kiện / đối tác / ghi chú (mã linh kiện và kho không đổi được sau khi tạo).
              </div>
            )}
            <div className="tbl-wrap">
              <table className="tbl tbl-dense eo-lines">
                <colgroup>{itemCols.map((c) => <col key={c.key} style={{ width: c.width }} />)}</colgroup>
                <thead><tr>{itemCols.map((c) => <th key={c.key} style={{ textAlign: c.align ?? "left" }}>{c.header}</th>)}</tr></thead>
                <tbody>
                  {items.map((r, i) => {
                    const existing = r.id != null;
                    return (
                      <tr key={r.id ?? `new-${i}`}>
                        <td style={{ textAlign: "center" }}>{i + 1}</td>
                        <td>{existing ? <b>{r.part_code}</b> : (
                          <input className="input" placeholder="Nhập mã LK" value={r.part_code} onChange={(e) => setItem(i, "part_code", e.target.value)} />
                        )}</td>
                        <td><input className="input" placeholder="Nhập tên linh kiện" value={r.part_name} onChange={(e) => setItem(i, "part_name", e.target.value)} /></td>
                        <td>{existing ? <span className="clip" style={{ display: "block" }} title={r.warehouse}>{r.warehouse}</span> : khoMacDinh ? (
                          <span className="clip" style={{ display: "block", fontSize: 12.5 }} title={`Theo phòng ban ${phongBan}: ${khoMacDinh}`}>{khoMacDinh}</span>
                        ) : (
                          <select className="select" title={r.warehouse} value={r.warehouse} onChange={(e) => setItem(i, "warehouse", e.target.value)}>
                            <option value="">Chọn kho</option>
                            {(khos.data ?? []).map((k) => <option key={k.ten_kho} value={k.ten_kho}>{k.ten_kho}</option>)}
                          </select>
                        )}</td>
                        <td><input className="input" placeholder="Nhập đối tác" value={r.supplier} onChange={(e) => setItem(i, "supplier", e.target.value)} /></td>
                        <td><input className="input right" placeholder="Nhập SL" value={r.current_qty} onChange={(e) => setItem(i, "current_qty", e.target.value)} /></td>
                        <td>{existing ? <span className="clip" style={{ display: "block" }} title={r.reason}>{r.reason || "—"}</span> : (
                          <input className="input" placeholder="Nhập lý do..." value={r.reason} onChange={(e) => setItem(i, "reason", e.target.value)} />
                        )}</td>
                        <td><input className="input" placeholder="Nhập ghi chú..." value={r.ghi_chu} onChange={(e) => setItem(i, "ghi_chu", e.target.value)} /></td>
                        <td><input className="input" placeholder="Mã ca" value={r.crm_id} onChange={(e) => setItem(i, "crm_id", e.target.value)} /></td>
                        <td><input className="input" placeholder="TLK-..." value={r.order_id} onChange={(e) => setItem(i, "order_id", e.target.value)} /></td>
                        <td style={{ textAlign: "center" }}>
                          <button className="btn ghost sm danger" onClick={() => setItems((rs) => rs.filter((_, j) => j !== i))}><I.trash width={15} height={15} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 12 }}>
              <button className="btn primary" onClick={() => setItems((rs) => [...rs, emptyItem()])}><I.plus width={14} height={14} /> Thêm dòng</button>
              <button className="btn" onClick={() => importRef.current?.click()}><I.upload width={14} height={14} /> Import Excel</button>
              <button className="btn ghost" onClick={downloadTemplate}><I.download width={14} height={14} /> Tải file mẫu</button>
              <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onImportFile(f); }} />
              <span className="badge nhap" style={{ fontSize: 13, marginLeft: "auto" }}>{items.filter((r) => r.part_code.trim()).length} dòng · Tổng SL: {soLuong(tongSL)}</span>
            </div>
            {importMsg && (
              <div style={{ marginTop: 10, fontSize: 12.5, padding: "8px 12px", borderRadius: 8, background: importMsg.errs.length ? "#FEF3C7" : "#DCFCE7" }}>
                Đã thêm <b>{importMsg.ok}</b> dòng từ Excel{importMsg.errs.length ? `, bỏ qua ${importMsg.errs.length} dòng lỗi:` : "."}
                {importMsg.errs.length > 0 && (
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {importMsg.errs.slice(0, 15).map((e) => <li key={e}>{e}</li>)}
                    {importMsg.errs.length > 15 && <li>… và {importMsg.errs.length - 15} dòng khác</li>}
                  </ul>
                )}
              </div>
            )}
          </div>

          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 16 }}>
          <div className="card card-pad">
            <h3 style={{ marginTop: 0, fontSize: 15 }}>3. Thẩm định & phê duyệt</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label className="field-label">Người thẩm định <span className="muted">(có thể để trống)</span></label>
                <select className="select" value="" onChange={(e) => { const v = e.target.value; if (v && !reviewers.includes(v)) setReviewers([...reviewers, v]); }}>
                  <option value="">Chọn người thẩm định</option>
                  {userOpts.filter((u) => !reviewers.includes(u)).map((u) => <option key={u} value={u}>{tenNguoi(u)}</option>)}
                </select>
                {reviewers.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {reviewers.map((r) => (
                      <span key={r} className="badge nhap" style={{ gap: 6 }}>
                        {ten(r)}
                        <span onClick={() => setReviewers(reviewers.filter((x) => x !== r))} style={{ cursor: "pointer", fontWeight: 800 }}>×</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="field-label">Người duyệt cuối <span className="req">*</span></label>
                <select className="select" value={finalApprover} onChange={(e) => setFinalApprover(e.target.value)}>
                  <option value="">Chọn người duyệt cuối</option>
                  {userOpts.map((u) => <option key={u} value={u}>{tenNguoi(u)}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="card card-pad">
            <h3 style={{ marginTop: 0, fontSize: 15 }}>4. Tài liệu đính kèm <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>(Excel, ảnh, PDF, Word — tối đa 20MB/tệp)</span></h3>
            {mode === "edit" && (eoQ.data?.files ?? []).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {(eoQ.data.files as any[]).filter((f) => !deletedFileIds.includes(f.id)).map((f) => (
                  <span key={f.id} className="badge issued" style={{ gap: 6 }}>
                    <a href={f.drive_url || undefined} target="_blank" rel="noopener" style={{ textDecoration: "none", color: "inherit", display: "inline-flex", gap: 4, alignItems: "center" }} title={`${ten(f.uploaded_by)} · ${f.uploaded_at}`}>
                      <I.file width={12} height={12} /> {f.file_name}
                    </a>
                    <span role="button" title="Xóa tệp đính kèm" onClick={() => deleteSavedFile(f)} style={{ cursor: "pointer", fontWeight: 800, color: "var(--danger)" }}>×</span>
                  </span>
                ))}
              </div>
            )}
            {pendingFiles.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {pendingFiles.map((f, i) => (
                  <span key={`${f.name}-${i}`} className="badge nhap" style={{ gap: 6 }}>
                    <I.file width={12} height={12} /> {f.name} <span className="muted">{fileSize(f.size)}</span>
                    <span role="button" title="Bỏ tệp này" onClick={() => setPendingFiles((fs) => fs.filter((_, j) => j !== i))} style={{ cursor: "pointer", fontWeight: 800, color: "var(--danger)" }}>×</span>
                  </span>
                ))}
              </div>
            )}
            <button className="btn sm" onClick={() => fileRef.current?.click()}><I.upload width={14} height={14} /> Chọn tệp đính kèm</button>
            <input ref={fileRef} type="file" multiple accept={FILE_ACCEPT} hidden onChange={(e) => { onPickFiles(e.target.files); e.target.value = ""; }} />
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Tệp được tải lên khi bấm Lưu nháp / Gửi trình duyệt và ghi vào lịch sử EO. Người thẩm định, duyệt cuối xem ở tab "Tài liệu đính kèm".
            </div>
            {fileErrs.length > 0 && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 6 }}>{fileErrs.join(" · ")}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
