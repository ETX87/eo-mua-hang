import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../api/client";
import { Popover } from "../../components/ui";
import { ngayGio, soLuong } from "../../lib/format";

/**
 * v0.116 Nut "📤 App Nhiem vu" o man Don PO: day TOAN BO PO dang cho duyet (tham dinh / duyet mua / dong them sau ban hanh)
 * len App Nhiem vu eOffice - moi nguoi duyet thay viec cua minh kem link mo dung PO. Backend lib/congNhiemVu.ts.
 * He thong cung tu gui sau moi thay doi PO + moi gio; nut nay de gui ngay / kiem tra.
 */
type TheoLoai = { REVIEW: number; FINAL: number; POST: number };
interface KetQua { ok: boolean; nguoi: number; viec: number; theo_loai: TheoLoai; viecMoi?: number; boChoGD?: number; khongRo?: unknown[]; loi?: string; luc: string }
interface TrangThai { bat: boolean; lan_cuoi: KetQua | null; hien_tai: { nguoi: number; viec: number; theo_loai: TheoLoai } }

const loaiTxt = (t: TheoLoai) => [t.REVIEW && `${t.REVIEW} thẩm định`, t.FINAL && `${t.FINAL} duyệt mua`, t.POST && `${t.POST} PO có dòng thêm sau BH`].filter(Boolean).join(" · ") || "không có";

export function NutCongNhiemVu() {
  const qc = useQueryClient();
  const [dang, setDang] = useState(false);
  const [bao, setBao] = useState<{ ok: boolean; txt: string } | null>(null);
  const st = useQuery({ queryKey: ["cong-nhiem-vu"], queryFn: () => api.get<TrangThai>("/cong-nhiem-vu"), staleTime: 30_000 });
  const d = st.data;

  const day = async () => {
    setDang(true); setBao(null);
    try {
      const r = await api.post<KetQua>("/cong-nhiem-vu/day", {});
      setBao({ ok: true, txt: `Đã đẩy ${soLuong(r.viec)} việc cho ${soLuong(r.nguoi)} người${r.viecMoi ? ` · ${r.viecMoi} việc mới có thông báo` : ""}${r.khongRo ? ` · ${r.khongRo.length} người chưa tra được hồ sơ nhân sự` : ""}.` });
    } catch (e) {
      const m = e instanceof ApiError ? (e.body as { message?: string } | null)?.message : null;
      setBao({ ok: false, txt: m || "Không đẩy được — thử lại sau." });
    } finally {
      setDang(false);
      qc.invalidateQueries({ queryKey: ["cong-nhiem-vu"] });
    }
  };

  const lc = d?.lan_cuoi;
  return (
    <Popover width={340} align="right" label={<>📤 App Nhiệm vụ{d?.hien_tai.viec ? ` (${d.hien_tai.viec})` : ""}</>}
      title="Đẩy PO đang chờ duyệt lên App Nhiệm vụ eOffice (kèm link mở đúng PO)" active={lc?.ok === false}>
      <div style={{ display: "grid", gap: 8, fontSize: 12.5 }}>
        <div><b>Đẩy việc chờ duyệt lên App Nhiệm vụ</b>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>Mỗi người thẩm định / duyệt mua thấy PO đang chờ mình ở App Nhiệm vụ (tab Liên kết → Mua hàng), bấm vào mở đúng PO. Hệ thống tự gửi sau mỗi thay đổi PO và mỗi giờ.</div>
        </div>
        {!d ? <span className="muted">Đang tải…</span> : !d.bat ? <span style={{ color: "var(--danger-ink)" }}>Chưa nạp khoá Cổng nhiệm vụ cho app — báo Admin.</span> : (
          <>
            <div>Đang chờ: <b>{soLuong(d.hien_tai.viec)}</b> việc / <b>{soLuong(d.hien_tai.nguoi)}</b> người <span className="muted">({loaiTxt(d.hien_tai.theo_loai)})</span></div>
            {lc && <div className="muted" style={{ fontSize: 11.5 }}>Lần gửi cuối {ngayGio(lc.luc)}: {lc.ok ? `✓ ${soLuong(lc.viec)} việc / ${soLuong(lc.nguoi)} người` : <span style={{ color: "var(--danger-ink)" }}>✗ {lc.loi}</span>}</div>}
            <button className="btn sm primary" disabled={dang} onClick={day}>{dang ? "Đang đẩy…" : "📤 Đẩy ngay"}</button>
          </>
        )}
        {bao && <div style={{ color: bao.ok ? "var(--ok-ink)" : "var(--danger-ink)" }}>{bao.txt}</div>}
      </div>
    </Popover>
  );
}
