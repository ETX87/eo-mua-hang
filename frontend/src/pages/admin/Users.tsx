import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { PageHeader, Card, Spinner, Modal } from "../../components/ui";
import { DataTable, PAGE_SIZE, type Col } from "../../components/DataTable";
import { I } from "../../lib/icons";
import { ten } from "../../lib/format";
import { EtxTab, GanNhanSuModal } from "./EtxNhanSu";

const ROLE_LABEL: Record<string, string> = {
  Admin: "Admin", "KH cung ung": "KH cung ứng", "Ke toan": "Kế toán", Kho: "Kho",
  "Theo doi tien do": "Theo dõi tiến độ", View: "Chỉ xem",
};
const ROLE_OPTS = Object.keys(ROLE_LABEL);

function roleDisplay(u: any): string {
  if (u.vai_tro) return ROLE_LABEL[u.vai_tro] ?? u.vai_tro;
  if (u.la_nv_dat_hang) return "Người đặt hàng";
  if (u.la_nv_kho) return "NV kho";
  if (u.la_ke_toan) return "Kế toán";
  if (u.la_theo_doi_td) return "Theo dõi tiến độ";
  if (u.la_view) return "Chỉ xem";
  return "—";
}

export default function Users() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"users" | "etx">("users");
  const [showAdd, setShowAdd] = useState(false);
  const [gan, setGan] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [phu, setPhu] = useState<any>(null);
  const q = useQuery({ queryKey: ["admin-users"], queryFn: () => api.get<any[]>("/users") });
  if (q.isLoading) return <Spinner />;
  const kw = search.trim().toLowerCase();
  const rows = (q.data ?? []).filter((r) => !kw ||
    [r.email, r.ho_ten, ten(r.email), r.gmail_phu, r.chuc_danh, r.ma_nhan_su].some((v) => String(v ?? "").toLowerCase().includes(kw)));

  const patch = async (email: string, body: any) => {
    await api.patch(`/users/${encodeURIComponent(email)}`, body);
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const cols: Col<any>[] = [
    // ten hien thi = ten ETX (lib/format ten), chua lien ket ETX -> Gmail
    { key: "ht", header: "Họ tên (theo ETX)", render: (r) => ten(r.email) },
    {
      key: "em", header: "Gmail đăng nhập", render: (r) => {
        const ds = String(r.gmail_phu ?? "").split(",").filter(Boolean);
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ fontSize: 12.5 }}>
              <span className="muted">{r.email}</span>
              {ds.map((g) => <div key={g} style={{ fontSize: 11.5, color: "var(--text-muted)" }}>+ {g}</div>)}
            </div>
            <button className="btn ghost sm" title="Gmail đăng nhập phụ (1 tài khoản đăng nhập bằng nhiều Gmail)" onClick={(e) => { e.stopPropagation(); setPhu(r); }}>
              <I.plus width={12} height={12} />{ds.length ? ds.length : ""}</button>
          </div>
        );
      },
    },
    {
      key: "etx", header: "Nhân sự ETX", render: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
          {r.ma_nhan_su
            ? <div><b>{r.ma_nhan_su}</b>{r.chuc_danh && <div className="muted" style={{ fontSize: 11.5 }}>{r.chuc_danh}</div>}</div>
            : <span className="muted">Chưa liên kết</span>}
          <button className="btn ghost sm" title="Gán nhân sự ETX" onClick={(e) => { e.stopPropagation(); setGan(r); }}><I.edit width={13} height={13} /></button>
        </div>
      ),
    },
    {
      key: "vt", header: "Vai trò", render: (r) => (
        <select className="select" style={{ width: 168 }} value={r.vai_tro ?? ""} onClick={(e) => e.stopPropagation()}
          onChange={(e) => patch(r.email, { vai_tro: e.target.value || null })}>
          <option value="">{r.vai_tro ? "— Bỏ vai trò —" : roleDisplay(r)}</option>
          {ROLE_OPTS.map((o) => <option key={o} value={o}>{ROLE_LABEL[o]}</option>)}
        </select>
      ),
    },
    {
      key: "tt", header: "Trạng thái", render: (r) => {
        if (r.trang_thai_duyet === "Cho duyet") return <span style={{ color: "var(--warn-ink)", fontWeight: 600 }}>Chờ duyệt</span>;
        if (r.trang_thai_duyet === "Tu choi") return <span style={{ color: "var(--danger-ink)", fontWeight: 600 }}>Từ chối</span>;
        if (!r.active) return <span className="muted" style={{ fontWeight: 600 }}>Ngừng hoạt động</span>;
        return <span style={{ color: "var(--ok-ink)", fontWeight: 600 }}>Hoạt động</span>;
      },
    },
    {
      key: "act", header: "", align: "right", render: (r) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
          {r.trang_thai_duyet !== "Da duyet"
            ? <button className="btn primary sm" onClick={() => patch(r.email, { trang_thai_duyet: "Da duyet" })}><I.check width={13} height={13} /> Duyệt</button>
            : <button className="btn ghost sm" onClick={() => patch(r.email, { active: r.active ? 0 : 1 })}>{r.active ? "Ngừng" : "Kích hoạt"}</button>}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Người dùng" />
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
        <button className={`btn sm ${tab === "users" ? "primary" : ""}`} onClick={() => setTab("users")}>Người dùng ({q.data?.length ?? 0})</button>
        <button className={`btn sm ${tab === "etx" ? "primary" : ""}`} onClick={() => setTab("etx")}>ETX nhân sự</button>
        <div style={{ flex: 1 }} />
        {tab === "users" && <button className="btn sm primary" onClick={() => setShowAdd(true)}><I.plus width={14} height={14} /> Thêm người dùng</button>}
      </div>
      {tab === "users" ? (
        <Card>
          <input className="input" style={{ maxWidth: 320, marginBottom: 12 }} placeholder="Tìm email, họ tên, mã NV, chức danh..."
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <DataTable cols={cols} rows={rows} keyOf={(r) => r.email} pageSize={PAGE_SIZE} />
        </Card>
      ) : <EtxTab />}
      {gan && <GanNhanSuModal user={gan} onClose={() => setGan(null)} onSaved={() => {
        setGan(null);
        qc.invalidateQueries({ queryKey: ["admin-users"] });
        qc.invalidateQueries({ queryKey: ["etx"] });
      }} />}
      {phu && <GmailPhuModal user={phu} onClose={() => setPhu(null)} onDone={() => { qc.invalidateQueries({ queryKey: ["admin-users"] }); qc.invalidateQueries({ queryKey: ["users-ten"] }); }} />}
      {showAdd && <AddUserModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); qc.invalidateQueries({ queryKey: ["admin-users"] }); }} />}
    </div>
  );
}

function AddUserModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState("");
  const [hoTen, setHoTen] = useState("");
  const [vaiTro, setVaiTro] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setErr("");
    if (!email.trim()) return setErr("Nhập email.");
    setBusy(true);
    try {
      await api.post("/users", { email: email.trim(), ho_ten: hoTen.trim() || undefined, vai_tro: vaiTro || undefined });
      onSaved();
    } catch (e: any) {
      setErr(e?.body?.error === "ALREADY_EXISTS" ? "Email này đã có trong hệ thống." :
        e?.body?.error === "INVALID_EMAIL" ? "Email không hợp lệ." : "Lỗi thêm người dùng.");
      setBusy(false);
    }
  };
  return (
    <Modal title="Thêm người dùng" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={busy} onClick={save}>Lưu</button></>}>
      <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Tài khoản sẽ được duyệt sẵn — khi đăng nhập bằng đúng email này, người dùng vào hệ thống ngay, không cần chờ duyệt lại. Nếu Gmail khớp nhân sự ETX, họ tên và chức danh tự lấy theo ETX.</div>
      <label className="field-label">Email <span className="req">*</span></label>
      <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@gmail.com" />
      <label className="field-label" style={{ marginTop: 12 }}>Họ tên</label>
      <input className="input" value={hoTen} onChange={(e) => setHoTen(e.target.value)} placeholder="Nhập họ tên (tuỳ chọn)" />
      <label className="field-label" style={{ marginTop: 12 }}>Vai trò</label>
      <select className="select" value={vaiTro} onChange={(e) => setVaiTro(e.target.value)}>
        <option value="">Chưa gán</option>
        {ROLE_OPTS.map((o) => <option key={o} value={o}>{ROLE_LABEL[o]}</option>)}
      </select>
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

/**
 * Gmail dang nhap PHU cua 1 tai khoan (2026-11-08, bang user_alias): dang nhap bang Gmail phu = vao dung tai khoan nay
 * (cung quyen, cung du lieu), Gmail phu hien ten tai khoan (ten ETX). Ten ETX khop theo Gmail chinh hoac bat ky Gmail phu.
 */
function GmailPhuModal({ user, onClose, onDone }: { user: any; onClose: () => void; onDone: () => void }) {
  const [ds, setDs] = useState<string[]>(String(user.gmail_phu ?? "").split(",").filter(Boolean));
  const [gmail, setGmail] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const them = async () => {
    const g = gmail.trim().toLowerCase();
    if (!g) return;
    setErr(""); setBusy(true);
    try {
      await api.post(`/users/${encodeURIComponent(user.email)}/gmail-phu`, { gmail: g });
      setDs((x) => [...x, g]); setGmail(""); onDone();
    } catch (e: any) {
      const c = e?.body?.error;
      setErr(c === "INVALID_EMAIL" ? "Gmail không hợp lệ." : c === "DA_LA_GMAIL_PHU" ? `Gmail này đã là Gmail phụ của ${e.body.cua}.`
        : c === "LA_TAI_KHOAN_RIENG" ? "Gmail này đang là 1 tài khoản riêng đã duyệt — ngừng tài khoản đó trước (hoặc dùng \"Gán nhân sự ETX › chuyển tài khoản\")."
        : c === "CO_GMAIL_PHU_RIENG" ? "Gmail này đang là tài khoản chính có Gmail phụ riêng." : c === "TAI_KHOAN_LA_GMAIL_PHU" ? "Tài khoản này đang là Gmail phụ của người khác." : "Lỗi thêm Gmail phụ.");
    } finally { setBusy(false); }
  };
  const bo = async (g: string) => {
    if (!confirm(`Bỏ Gmail phụ ${g}? Gmail này sẽ không đăng nhập vào tài khoản ${ten(user.email)} nữa.`)) return;
    await api.del(`/users/${encodeURIComponent(user.email)}/gmail-phu/${encodeURIComponent(g)}`);
    setDs((x) => x.filter((y) => y !== g)); onDone();
  };
  return (
    <Modal title={`Gmail đăng nhập — ${ten(user.email)}`} onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Xong</button>}>
      <div style={{ fontSize: 13 }}>
        <div className="muted" style={{ marginBottom: 10 }}>
          1 tài khoản có thể đăng nhập bằng nhiều Gmail. Đăng nhập bằng Gmail phụ = vào đúng tài khoản này (cùng vai trò, cùng dữ liệu);
          mọi nơi hiện tên theo ETX nhân sự của tài khoản.
        </div>
        <div style={{ marginBottom: 8 }}><b>Gmail chính:</b> {user.email}</div>
        {ds.map((g) => (
          <div key={g} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
            <span style={{ flex: 1 }}>{g}</span>
            <button className="btn ghost sm" style={{ color: "var(--danger-ink)" }} onClick={() => bo(g)}>Bỏ</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <input className="input" placeholder="Thêm Gmail phụ…" value={gmail} onChange={(e) => setGmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && them()} />
          <button className="btn primary" disabled={busy || !gmail.trim()} onClick={them}>Thêm</button>
        </div>
        {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
      </div>
    </Modal>
  );
}
