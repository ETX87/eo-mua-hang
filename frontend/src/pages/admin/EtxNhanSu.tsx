import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Card, Spinner, Modal } from "../../components/ui";
import { DataTable, Pagination, FilterBar, type Col } from "../../components/DataTable";
import { I } from "../../lib/icons";
import { ngayGio } from "../../lib/format";

export interface EtxRow {
  ma_nhan_su: string; ho_ten: string; chuc_danh: string | null; gmail: string | null; gmail_gan_tay: string | null;
  gmail_hieu_luc: string | null; trang_thai_lam_viec: "on" | "off";
  user_email: string | null; user_vai_tro: string | null; user_trang_thai: string | null; user_active: number | null;
}

const PAGE = 20;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function useEtxList(search: string, trangThai: string, lienKet: string, offset: number) {
  const p = new URLSearchParams({ page: String(offset / PAGE + 1), pageSize: String(PAGE) });
  if (search) p.set("search", search);
  if (trangThai) p.set("trang_thai", trangThai);
  if (lienKet) p.set("lien_ket", lienKet);
  return useQuery({
    queryKey: ["etx", p.toString()],
    queryFn: () => api.get<{ rows: EtxRow[]; total: number }>(`/etx-nhan-su?${p}`),
  });
}

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["etx"] });
  qc.invalidateQueries({ queryKey: ["etx-status"] });
  qc.invalidateQueries({ queryKey: ["admin-users"] });
};

export function EtxTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [trangThai, setTrangThai] = useState("");
  const [lienKet, setLienKet] = useState("");
  const [offset, setOffset] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [edit, setEdit] = useState<EtxRow | null>(null);
  const list = useEtxList(search, trangThai, lienKet, offset);
  const st = useQuery({ queryKey: ["etx-status"], queryFn: () => api.get<any>("/etx-nhan-su/sync-status") });

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api.post<any>("/etx-nhan-su/sync/run");
      if (r.last_status === "ok" && r.result) {
        const x = r.result;
        alert(`Đồng bộ xong: ${x.total} nhân sự, ${x.inserted} mới, ${x.changed} thay đổi, ${x.linked} tài khoản đã liên kết`
          + (x.locked ? `, khoá ${x.locked} tài khoản nghỉ việc` : "") + (x.unlocked ? `, mở ${x.unlocked}` : "") + ".");
      }
    } finally {
      setSyncing(false);
      invalidateAll(qc);
    }
  };

  const s = st.data;
  const cols: Col<EtxRow>[] = [
    { key: "ma", header: "Mã NV", render: (r) => r.ma_nhan_su },
    { key: "ten", header: "Họ tên", render: (r) => <b>{r.ho_ten}</b> },
    { key: "cd", header: "Chức danh", render: (r) => r.chuc_danh || "—" },
    {
      key: "gm", header: "Gmail sử dụng", render: (r) => (
        <div style={{ fontSize: 12.5 }}>
          {r.gmail_hieu_luc || <span className="muted">— chưa có —</span>}
          {r.gmail_hieu_luc && !EMAIL_RE.test(r.gmail_hieu_luc) && (
            <div style={{ color: "var(--danger-ink)", fontSize: 11 }}>Không phải Gmail hợp lệ — bấm "Đổi Gmail" để sửa</div>
          )}
          {r.gmail_gan_tay != null && (
            <div className="muted" style={{ fontSize: 11 }}>
              <span className="badge final" style={{ marginRight: 4 }}>Gán tay</span>ETX: {r.gmail || "trống"}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "tt", header: "Làm việc", render: (r) => r.trang_thai_lam_viec === "on"
        ? <span className="badge issued">Đang làm</span> : <span className="badge reject">Nghỉ</span>,
    },
    {
      key: "tk", header: "Tài khoản app", render: (r) => r.user_email ? (
        <div style={{ fontSize: 12.5 }}>
          <span style={{ color: r.user_active ? "var(--ok-ink)" : "var(--text-muted)", fontWeight: 600 }}>
            {r.user_trang_thai !== "Da duyet" ? "Chờ duyệt" : r.user_active ? "Đã liên kết" : "Đã khoá"}
          </span>
          {r.user_vai_tro && <span className="muted"> · {r.user_vai_tro}</span>}
        </div>
      ) : <span className="muted" style={{ fontSize: 12.5 }}>Chưa có tài khoản</span>,
    },
    {
      key: "act", header: "", align: "right", render: (r) => (
        <button className="btn ghost sm" onClick={() => setEdit(r)}><I.edit width={13} height={13} /> Đổi Gmail</button>
      ),
    },
  ];

  return (
    <>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260, fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Đồng bộ ETX nhân sự</div>
            <div className="muted">
              Kéo danh bạ từ ETX, tự cập nhật <b>họ tên</b> và <b>chức danh</b> cho tài khoản có cùng Gmail. Vai trò quyền vẫn gán tay ở tab Người dùng.
              Nhân sự chuyển sang nghỉ việc → tài khoản liên kết tự khoá.
            </div>
            {s && (
              <div style={{ marginTop: 6 }}>
                Lần gần nhất: <b>{s.last_run_at ? ngayGio(s.last_run_at) : "chưa chạy"}</b>
                {s.last_status === "ok" && <span style={{ color: "var(--ok-ink)" }}> · thành công ({s.changed_count} thay đổi)</span>}
                {s.last_status === "error" && <span style={{ color: "var(--danger-ink)" }}> · lỗi: {s.last_error}</span>}
                <span className="muted"> · {s.tong ?? 0} nhân sự · {s.da_lien_ket ?? 0} tài khoản đã liên kết · {s.chua_lien_ket ?? 0} chưa liên kết</span>
              </div>
            )}
          </div>
          <button className="btn primary" disabled={syncing} onClick={sync}>
            <I.refresh width={14} height={14} /> {syncing ? "Đang đồng bộ..." : "Đồng bộ ngay"}
          </button>
        </div>
      </Card>
      <Card>
        <FilterBar>
          <input className="input" style={{ maxWidth: 300 }} placeholder="Tìm mã NV, họ tên, Gmail, chức danh..."
            value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} />
          <select className="select" style={{ width: 140 }} value={trangThai} onChange={(e) => { setTrangThai(e.target.value); setOffset(0); }}>
            <option value="">Làm việc: tất cả</option><option value="on">Đang làm</option><option value="off">Nghỉ</option>
          </select>
          <select className="select" style={{ width: 170 }} value={lienKet} onChange={(e) => { setLienKet(e.target.value); setOffset(0); }}>
            <option value="">Tài khoản: tất cả</option><option value="co">Đã có tài khoản</option><option value="chua">Chưa có tài khoản</option>
          </select>
        </FilterBar>
        {list.isLoading ? <Spinner /> : (
          <>
            <DataTable cols={cols} rows={list.data?.rows ?? []} keyOf={(r) => r.ma_nhan_su}
              empty={s?.tong ? "Không có nhân sự khớp bộ lọc" : "Chưa có dữ liệu — bấm \"Đồng bộ ngay\""} />
            {list.data && <Pagination total={list.data.total} limit={PAGE} offset={offset} onPage={setOffset} />}
          </>
        )}
      </Card>
      {edit && <DoiGmailModal row={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); invalidateAll(qc); }} />}
    </>
  );
}

function DoiGmailModal({ row, onClose, onSaved }: { row: EtxRow; onClose: () => void; onSaved: () => void }) {
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => api.get<any[]>("/users") });
  const [gmail, setGmail] = useState(row.gmail_hieu_luc ?? "");
  const [taoTk, setTaoTk] = useState(true);
  const [chuyen, setChuyen] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const target = gmail.trim().toLowerCase();
  const exists = (users.data ?? []).some((u) => u.email === target);
  const oldEmail = row.user_email;
  const canMove = !!oldEmail && !!target && oldEmail !== target;

  const send = async (body: any) => {
    setErr(""); setBusy(true);
    try {
      await api.patch(`/etx-nhan-su/${encodeURIComponent(row.ma_nhan_su)}/gmail`, body);
      onSaved();
    } catch (e: any) {
      const c = e?.body?.error;
      setErr(c === "INVALID_EMAIL" ? "Gmail không hợp lệ." : c === "CANNOT_MOVE_BOOTSTRAP_ADMIN" ? "Không chuyển được tài khoản Admin gốc." : "Lỗi lưu.");
      setBusy(false);
    }
  };
  const save = () => {
    if (!target) return setErr("Nhập Gmail.");
    send({ gmail: target, tao_tai_khoan: !exists && taoTk, chuyen_tu: canMove && chuyen ? oldEmail : null });
  };

  return (
    <Modal title={`Gmail sử dụng — ${row.ho_ten} (${row.ma_nhan_su})`} onClose={onClose}
      footer={<>
        {row.gmail_gan_tay != null && <button className="btn" disabled={busy} onClick={() => send({ gmail: null })} title="Bỏ gán tay, dùng lại Gmail trên ETX">Dùng Gmail ETX</button>}
        {row.gmail_hieu_luc && <button className="btn danger" disabled={busy} onClick={() => send({ gmail: "" })}>Bỏ liên kết</button>}
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={onClose}>Hủy</button>
        <button className="btn primary" disabled={busy} onClick={save}>Lưu</button>
      </>}>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
        Gmail trên ETX: <b>{row.gmail || "trống"}</b>. Gán tay khi Gmail ETX sai hoặc nhân sự đã đổi sang Gmail khác — lần đồng bộ sau vẫn giữ Gmail gán tay.
      </div>
      <label className="field-label">Gmail sử dụng</label>
      <input className="input" value={gmail} onChange={(e) => setGmail(e.target.value)} placeholder="ten@gmail.com" list="etx-user-emails" />
      <datalist id="etx-user-emails">{(users.data ?? []).map((u) => <option key={u.email} value={u.email}>{u.ho_ten}</option>)}</datalist>
      {target && (
        <div style={{ fontSize: 12.5, marginTop: 8 }}>
          {exists
            ? <span style={{ color: "var(--ok-ink)" }}>Đã có tài khoản với Gmail này — sẽ liên kết và cập nhật họ tên, chức danh.</span>
            : <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={taoTk} onChange={(e) => setTaoTk(e.target.checked)} />
                Chưa có tài khoản — tạo tài khoản đã duyệt cho Gmail này
              </label>}
        </div>
      )}
      {canMove && (
        <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12.5, marginTop: 10, padding: 10, background: "#FEF3C7", borderRadius: 8 }}>
          <input type="checkbox" checked={chuyen} onChange={(e) => setChuyen(e.target.checked)} style={{ marginTop: 2 }} />
          <span>Đổi Gmail sử dụng: chuyển vai trò + quyền từ tài khoản cũ <b>{oldEmail}</b> sang Gmail mới và <b>khoá tài khoản cũ</b>.
            (Lịch sử EO cũ vẫn giữ tên tài khoản cũ.)</span>
        </label>
      )}
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

/** Gan thu cong 1 tai khoan app voi 1 nhan su ETX (tu tab Nguoi dung). */
export function GanNhanSuModal({ user, onClose, onSaved }: { user: any; onClose: () => void; onSaved: () => void }) {
  const [search, setSearch] = useState(user.ho_ten && !String(user.ho_ten).includes("@") ? user.ho_ten : "");
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState("");
  const list = useEtxList(search.trim(), "", "", offset);
  const pick = async (r: EtxRow | null) => {
    setErr("");
    try {
      if (r) await api.patch(`/etx-nhan-su/${encodeURIComponent(r.ma_nhan_su)}/gmail`, { gmail: user.email });
      else await api.patch(`/etx-nhan-su/${encodeURIComponent(user.ma_nhan_su)}/gmail`, { gmail: "" });
      onSaved();
    } catch { setErr("Lỗi gán nhân sự."); }
  };
  const cols: Col<EtxRow>[] = [
    { key: "ma", header: "Mã NV", render: (r) => r.ma_nhan_su },
    { key: "ten", header: "Họ tên", render: (r) => <b>{r.ho_ten}</b> },
    { key: "cd", header: "Chức danh", render: (r) => r.chuc_danh || "—" },
    { key: "gm", header: "Gmail hiện tại", render: (r) => <span className="muted" style={{ fontSize: 12 }}>{r.gmail_hieu_luc || "—"}</span> },
    { key: "tt", header: "", render: (r) => r.trang_thai_lam_viec === "off" ? <span className="badge reject">Nghỉ</span> : null },
    {
      key: "act", header: "", align: "right", render: (r) => r.ma_nhan_su === user.ma_nhan_su
        ? <span className="badge issued">Đang gán</span>
        : <button className="btn primary sm" onClick={() => pick(r)}>Chọn</button>,
    },
  ];
  return (
    <Modal wide title={`Gán nhân sự ETX — ${user.email}`} onClose={onClose}
      footer={<>
        {user.ma_nhan_su && <button className="btn danger" onClick={() => pick(null)}>Bỏ liên kết</button>}
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={onClose}>Đóng</button>
      </>}>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
        Chọn nhân sự ETX của tài khoản này. Gmail <b>{user.email}</b> sẽ được gán tay cho nhân sự đó; họ tên và chức danh lấy theo ETX.
      </div>
      <input className="input" placeholder="Tìm mã NV, họ tên, Gmail..." value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} />
      <div style={{ marginTop: 10, maxHeight: "55vh", overflowY: "auto" }}>
        {list.isLoading ? <Spinner /> : (
          <>
            <DataTable cols={cols} rows={list.data?.rows ?? []} keyOf={(r) => r.ma_nhan_su} empty="Không tìm thấy — đã đồng bộ ETX chưa?" />
            {list.data && <Pagination total={list.data.total} limit={PAGE} offset={offset} onPage={setOffset} />}
          </>
        )}
      </div>
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}
