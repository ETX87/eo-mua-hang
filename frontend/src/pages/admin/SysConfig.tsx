import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { PageHeader, Card, Spinner } from "../../components/ui";
import { ngayGio, soLuong } from "../../lib/format";

function ConfigRow({ r, onSave }: { r: { key: string; value: string | null }; onSave: (key: string, value: string) => Promise<void> }) {
  const [value, setValue] = useState(r.value ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await onSave(r.key, value); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 240, fontWeight: 600, fontSize: 13 }}>{r.key}</div>
      <input className="input" value={value} onChange={(e) => setValue(e.target.value)} style={{ flex: 1, maxWidth: 400 }} />
      <button className="btn sm" disabled={busy} onClick={save}>Lưu</button>
    </div>
  );
}

function GoogleDriveCard() {
  const q = useQuery({
    queryKey: ["google-drive-status"],
    queryFn: () => api.get<{ connected: boolean; google_email?: string; authorized_at?: string }>("/danh-muc/google-drive/status"),
  });
  return (
    <Card style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0, fontSize: 15 }}>Google Drive — tài liệu đính kèm EO</h3>
      <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        Uỷ quyền 1 tài khoản Google thật để lưu file đính kèm EO (mục "Tài liệu đính kèm" ở Chi tiết EO). Chưa kết nối thì tải file lên sẽ báo lỗi.
      </div>
      {q.isLoading ? <Spinner /> : (
        <>
          <div style={{ fontSize: 13, marginBottom: 10 }}>
            Trạng thái: {q.data?.connected
              ? <span style={{ color: "var(--ok-ink)", fontWeight: 600 }}>Đã kết nối ({q.data.google_email})</span>
              : <span className="muted" style={{ fontWeight: 600 }}>Chưa kết nối</span>}
          </div>
          <a className="btn sm" href="/api/danh-muc/google-drive/authorize">
            {q.data?.connected ? "Kết nối lại / đổi tài khoản" : "Kết nối tài khoản Google Drive"}
          </a>
        </>
      )}
    </Card>
  );
}

/** Dong bo PO (dong EO) sang app DVBH - lib/dvbhSync.ts phia backend, tu chay sau moi thay doi. */
function DvbhSyncCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["dvbh-sync"], queryFn: () => api.get<any>("/dvbh-sync/status"), refetchInterval: 15000 });
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const run = async (full: boolean) => {
    if (full && !confirm("Gửi lại TOÀN BỘ dòng EO sang DVBH? (dùng khi DVBH bị lệch dữ liệu)")) return;
    setBusy(full ? "full" : "delta"); setMsg("");
    try {
      const r = await api.post<any>("/dvbh-sync/run", { full });
      setMsg(`Đã gửi ${soLuong(r.pushed)} / ${soLuong(r.total)} dòng.`);
    } catch (e: any) {
      setMsg(e?.body?.message || e?.body?.error || "Lỗi đồng bộ.");
    } finally {
      setBusy(""); qc.invalidateQueries({ queryKey: ["dvbh-sync"] });
    }
  };
  const d = q.data;
  const st = d?.state ?? {};
  return (
    <Card style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0, fontSize: 15 }}>Đồng bộ PO sang app DVBH</h3>
      <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        Mỗi dòng EO (mã LK, kho, SL đặt / về AMIS / còn thiếu, ngày dự kiến, kế hoạch hàng về, phiếu nhập, ID CRM…) tự gửi sang DVBH
        sau mỗi thay đổi — chỉ gửi dòng có thay đổi. DVBH dùng song song với Google Sheet cũ.
      </div>
      {q.isLoading ? <Spinner /> : !d?.configured ? (
        <div style={{ color: "var(--danger)", fontSize: 13 }}>Chưa cấu hình (thiếu DVBH_API_KEY / DVBH_BASE_URL).</div>
      ) : (
        <>
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            Lần gửi thành công gần nhất: <b>{st.last_ok_at ? ngayGio(st.last_ok_at) : "chưa có"}</b>
            {st.last_ok_at && <> · gửi {soLuong(st.last_pushed)} dòng thay đổi</>}<br />
            Số dòng DVBH đã nhận: <b>{soLuong(d.so_dong_da_gui)}</b>
            {st.last_full_at && <> · đồng bộ toàn bộ lần cuối {ngayGio(st.last_full_at)}</>}<br />
            {st.last_error && <span style={{ color: "var(--danger)" }}>Lỗi lần chạy gần nhất ({ngayGio(st.last_run_at)}): {st.last_error}</span>}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn sm primary" disabled={!!busy} onClick={() => run(false)}>{busy === "delta" ? "Đang gửi..." : "Gửi thay đổi ngay"}</button>
            <button className="btn sm" disabled={!!busy} onClick={() => run(true)}>{busy === "full" ? "Đang gửi toàn bộ..." : "Đồng bộ toàn bộ"}</button>
          </div>
          {msg && <div style={{ fontSize: 13, marginTop: 8 }}>{msg}</div>}
        </>
      )}
    </Card>
  );
}

export default function SysConfig() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["app-settings"], queryFn: () => api.get<any[]>("/danh-muc/app") });
  if (q.isLoading) return <Spinner />;
  const rows = q.data ?? [];

  const save = async (key: string, value: string) => {
    await api.put(`/danh-muc/app/${encodeURIComponent(key)}`, { value });
    qc.invalidateQueries({ queryKey: ["app-settings"] });
  };

  return (
    <div>
      <PageHeader title="Cấu hình hệ thống" breadcrumb={["Cài đặt", "Cấu hình hệ thống"]} />
      <GoogleDriveCard />
      <DvbhSyncCard />
      <Card>
        {rows.length === 0 && <div className="muted" style={{ padding: 20 }}>Chưa có tham số cấu hình. Các mục sẽ xuất hiện khi hệ thống cần.</div>}
        {rows.map((r) => <ConfigRow key={r.key} r={r} onSave={save} />)}
      </Card>
    </div>
  );
}
