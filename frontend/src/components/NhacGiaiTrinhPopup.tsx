import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Modal } from "./ui";
import { EoLink, DongLink } from "./quickview/QuickView";
import { gioTxt } from "../lib/giaiDoan";
import { usePushNotifications } from "../hooks/usePushNotifications";

/**
 * POPUP NHAC GIAI TRINH khi MO APP (v0.105, 2026-11-19 — "Ca quá hạn sẽ báo đích danh người phải giải trình, và nhắc lại khi còn 6 giờ là hết
 * hạn giải trình. đẩy qua thông báo, khi mở sẽ hiện popup nhắc nhở", lam tuong tu app linh kien). Nguon GET /api/vi-pham/nhac-cua-toi
 * (loi CHO_GIAI_TRINH cua toi, gop theo dong LK, han giai trinh + gio LV con lai). Hoi lai 5 phut / khi quay lai tab.
 * "Để sau" = an trong PHIEN mo app nay (sessionStorage); mo app lai, co loi moi, hoac dong chuyen sang "sắp hết hạn" thi hien lai.
 * Link day "/?nhac_giai_trinh=1" (bam thong bao day) = luon hien lai.
 */
interface Dong {
  item_id: number; eo_id: number; ma_po: string; part_code: string | null; part_name: string | null; so_loi: number; quy_tac: string;
  han: string | null; con_gio: number | null; sap_het: boolean;
}
interface Data { rows: Dong[]; tong_loi: number; gio_nhac: number; gio_tu_dong: number; }

const KHOA_AN = "nhac-giai-trinh-an";
const QT: Record<string, string> = { R1: "chưa có ngày DK", R3: "không push NCC", R4: "quá ngày DK", R5: "chậm duyệt", TAY: "lỗi ghi tay" };
const hanTxt = (h: string | null) => (h ? `${h.slice(11, 16)} ${h.slice(8, 10)}/${h.slice(5, 7)}` : "—");

export function NhacGiaiTrinhPopup() {
  const nav = useNavigate();
  const loc = useLocation();
  const push = usePushNotifications();
  const q = useQuery({
    queryKey: ["nhac-giai-trinh"],
    queryFn: () => api.get<Data>("/vi-pham/nhac-cua-toi"),
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
  const [anKhoa, setAnKhoa] = useState(() => sessionStorage.getItem(KHOA_AN) ?? "");
  // Mo tu thong bao day -> bo an, hien lai; xoa tham so khoi URL.
  useEffect(() => {
    const sp = new URLSearchParams(loc.search);
    if (sp.get("nhac_giai_trinh")) {
      sessionStorage.removeItem(KHOA_AN);
      setAnKhoa("");
      sp.delete("nhac_giai_trinh");
      nav({ pathname: loc.pathname, search: sp.toString() ? `?${sp}` : "" }, { replace: true });
    }
  }, [loc.search, loc.pathname, nav]);

  const rows = q.data?.rows ?? [];
  const sapHet = rows.filter((r) => r.sap_het);
  const khoa = rows.map((r) => r.item_id + ":" + r.so_loi + (r.sap_het ? "!" : "")).join(",");
  const an = () => { sessionStorage.setItem(KHOA_AN, khoa); setAnKhoa(khoa); };
  if (!rows.length || anKhoa === khoa) return null;

  return (
    <Modal
      title={sapHet.length ? "⚠ Sắp hết hạn giải trình" : "⏰ Bạn có lỗi cần giải trình"}
      onClose={an}
      width={620}
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn ghost" onClick={an}>Để sau</button>
          <button className="btn primary" onClick={() => { an(); nav("/vi-pham?xem=cua_toi&tt=cho"); }}>Mở Vi phạm & giải trình</button>
        </div>
      }
    >
      <div style={{ display: "grid", gap: 10, fontSize: 13.5 }}>
        <div style={{
          border: 0, background: sapHet.length ? "#fff2f1" : "#fff6e8",
          color: sapHet.length ? "#d70015" : "#9c4f00", borderRadius: 12, padding: "10px 14px", fontWeight: 700, fontSize: 14.5,
        }}>
          Bạn đang có {q.data?.tong_loi} lỗi chờ giải trình trên {rows.length} dòng linh kiện.
          {sapHet.length > 0 && <> {sapHet.length} dòng sắp hết hạn giải trình (còn ≤ {q.data?.gio_nhac} giờ làm việc).</>}
          <div style={{ fontWeight: 400, fontSize: 12.5, marginTop: 4 }}>
            Hạn giải trình = {q.data?.gio_tu_dong} giờ làm việc từ khi phát sinh lỗi. Quá hạn, hệ thống tự ghi nhận vi phạm và không giải trình được nữa.
          </div>
        </div>
        <div style={{ maxHeight: "45vh", overflowY: "auto", display: "grid", gap: 6 }}>
          {rows.slice(0, 30).map((r) => (
            <div key={r.item_id} style={{ display: "flex", gap: 10, alignItems: "center", background: r.sap_het ? "#fff2f1" : "var(--panel-2)", borderRadius: 12, padding: "8px 12px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "baseline" }} onClick={an}>
                  <EoLink id={r.eo_id}>{r.ma_po}</EoLink>
                  <span className="muted">·</span>
                  <DongLink id={r.item_id} ma={r.part_code} />
                  <span className="muted" style={{ fontSize: 12 }}>
                    · {r.so_loi} lỗi ({r.quy_tac.split(",").map((x) => QT[x] ?? x).join(", ")})
                  </span>
                </div>
                {r.part_name && <div className="muted" style={{ fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.part_name}</div>}
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap", fontSize: 12 }}>
                {r.con_gio == null ? <span className="muted">Lỗi ghi tay</span> : (
                  <span style={{ fontWeight: 700, color: r.con_gio < 0 ? "#d70015" : r.sap_het ? "#c26400" : "#047857" }}>
                    {r.con_gio < 0 ? `Trễ ${gioTxt(-r.con_gio)}` : `Còn ${gioTxt(r.con_gio)}`}
                  </span>
                )}
                <div className="muted" style={{ fontSize: 11 }}>hạn {hanTxt(r.han)}</div>
              </div>
            </div>
          ))}
          {rows.length > 30 && <div className="muted" style={{ textAlign: "center", fontSize: 12 }}>… và {rows.length - 30} dòng khác trong "Vi phạm & giải trình"</div>}
        </div>
        {push.supported && push.checked && !push.subscribed && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", background: "var(--panel-2, #f5f5f7)", borderRadius: 10, padding: "8px 12px", fontSize: 12.5 }}>
            <span style={{ flex: 1 }}>Bật thông báo đẩy để nhận nhắc lỗi mới / sắp hết hạn ngay trên máy này, kể cả khi không mở app.</span>
            <button className="btn sm" disabled={push.busy} onClick={() => push.subscribe().catch((e) => alert(e instanceof Error ? e.message : String(e)))}>
              🔔 Bật thông báo đẩy
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Nut bat / tat thong bao day tren thiet bi nay - dat o dau popup chuong thong bao. */
export function NutThongBaoDay() {
  const push = usePushNotifications();
  if (!push.supported || !push.checked) return null;
  return (
    <button
      className="btn ghost sm"
      style={{ fontSize: 12 }}
      disabled={push.busy}
      title={push.subscribed ? "Tắt thông báo đẩy trên máy này" : "Nhận thông báo đẩy trên máy này (kể cả khi không mở app)"}
      onClick={() => (push.subscribed ? push.unsubscribe() : push.subscribe()).catch((e) => alert(e instanceof Error ? e.message : String(e)))}
    >
      {push.subscribed ? "🔕 Tắt đẩy" : "🔔 Bật đẩy"}
    </button>
  );
}

/**
 * v0.113 (2026-11-23): MOI BAT THONG BAO DAY sau khi dang nhap - kiem tra production: 0 thiet bi bat day tren toan he thong
 * nen nhac sap het han giai trinh / loi moi khong toi ai. Hien 1 the nho goc duoi phai khi trinh duyet ho tro, chua bat, chua bi chan;
 * "De sau" = an 3 ngay (localStorage). Trinh duyet da CHAN quyen -> the huong dan mo chan (bam o khoa canh dia chi -> Thong bao -> Cho phep).
 */
const KHOA_MOI_DAY = "eomua:moi-bat-day";
export function MoiBatDay() {
  const push = usePushNotifications();
  const [an, setAn] = useState(() => { const t = Number(localStorage.getItem(KHOA_MOI_DAY) || 0); return Date.now() - t < 3 * 86400_000; });
  const [loi, setLoi] = useState("");
  const chan = typeof Notification !== "undefined" && Notification.permission === "denied";
  if (an || !push.supported || !push.checked || push.subscribed) return null;
  const deSau = () => { localStorage.setItem(KHOA_MOI_DAY, String(Date.now())); setAn(true); };
  return (
    <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 150, width: 340, background: "rgba(255,255,255,.96)", WebkitBackdropFilter: "saturate(180%) blur(20px)", backdropFilter: "saturate(180%) blur(20px)", border: 0,
      borderRadius: 18, boxShadow: "0 0 0 .5px rgba(0,0,0,.1), 0 18px 44px rgba(0,0,0,.16)", padding: "14px 16px", fontSize: 13, animation: "ap-in .22s cubic-bezier(.2,.8,.2,1)" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{chan ? "🔕 Trình duyệt đang chặn thông báo" : "🔔 Bật thông báo trên máy này?"}</div>
      <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>Nhận nhắc ngay khi có lỗi mới cần giải trình và khi còn ≤ 6 giờ làm việc là hết hạn — kể cả lúc không mở app.
        Hết hạn mà không giải trình sẽ bị ghi vi phạm.</div>
      {chan && <div style={{ fontSize: 12.5, marginTop: 6, background: "#fff1dc", borderRadius: 8, padding: "6px 8px" }}>
        Mở chặn: bấm biểu tượng <b>🔒 / ⓘ</b> bên trái thanh địa chỉ → <b>Thông báo</b> → <b>Cho phép</b> → tải lại trang, rồi bấm "Bật thông báo".</div>}
      {loi && <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 6 }}>{loi}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
        <button className="btn sm" onClick={deSau}>Để sau</button>
        {!chan && <button className="btn sm primary" disabled={push.busy} onClick={() => push.subscribe().then(() => setLoi("")).catch((e) => setLoi(e instanceof Error ? e.message : String(e)))}>
          {push.busy ? "Đang bật…" : "Bật thông báo"}</button>}
      </div>
    </div>
  );
}
