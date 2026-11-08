import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

/**
 * Goi y o nhap dong linh kien (GET /danh-muc/goi-y-dong): ma LK + ten, doi tac, ly do PS da tung dung.
 * Dung <datalist> => van go gia tri moi duoc, hoac chon tu danh sach. Render <GoiYDatalists /> 1 lan / man,
 * roi gan list={DL.lk | DL.doiTac | DL.lyDo} vao input.
 */
export const DL = { lk: "dl-goi-y-lk", doiTac: "dl-goi-y-doi-tac", lyDo: "dl-goi-y-ly-do" } as const;

interface GoiYDong { linh_kien: { ma: string; ten: string }[]; doi_tac: string[]; ly_do: string[] }

export function useGoiYDong() {
  const q = useQuery({ queryKey: ["goi-y-dong"], queryFn: () => api.get<GoiYDong>("/danh-muc/goi-y-dong"), staleTime: 5 * 60_000 });
  const tenMap = useMemo(() => new Map((q.data?.linh_kien ?? []).map((x) => [x.ma.trim().toUpperCase(), x.ten])), [q.data]);
  /** ten da biet cua ma LK (khong phan biet hoa thuong) - "" neu ma moi / chua co ten. */
  const tenTheoMa = (ma: string) => tenMap.get(ma.trim().toUpperCase()) ?? "";
  return { data: q.data, tenTheoMa };
}

/**
 * Doi ma LK cua 1 dong: tu dien ten neu ma da co. Chi ghi de ten khi ten dang trong hoac la ten tu dien cua ma truoc
 * (nguoi dung da go ten rieng thi giu nguyen).
 */
export function tenKhiDoiMa(tenTheoMa: (ma: string) => string, maCu: string, maMoi: string, tenHienTai: string) {
  const tenCu = tenTheoMa(maCu), tenMoi = tenTheoMa(maMoi);
  const tuDien = !tenHienTai.trim() || tenHienTai === tenCu;
  return tuDien ? tenMoi : tenHienTai;
}

export function GoiYDatalists({ data }: { data?: GoiYDong }) {
  if (!data) return null;
  return (
    <>
      <datalist id={DL.lk}>{data.linh_kien.map((x) => <option key={x.ma} value={x.ma} label={x.ten || undefined} />)}</datalist>
      <datalist id={DL.doiTac}>{data.doi_tac.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id={DL.lyDo}>{data.ly_do.map((x) => <option key={x} value={x} />)}</datalist>
    </>
  );
}

/** 4 ly do phat sinh chuan (chot 2026-11-08, backend lib/chuanHoa + dm_chuan) - du phong khi chua tai danh muc. */
export const LY_DO_CHUAN = ["Ký gửi", "Đặt lần đầu", "Kế hoạch tháng", "Phát sinh"];

/** O chon Ly do PS: chi 4 gia tri chuan (khong go tu do). Gia tri cu ngoai danh sach (vd nhap tu Excel) hien kem "(chưa chuẩn)". */
export function ChonLyDo({ value, onChange, data, className = "select", style }: { value: string; onChange: (v: string) => void; data?: GoiYDong; className?: string; style?: React.CSSProperties }) {
  const ds = data?.ly_do?.length ? data.ly_do : LY_DO_CHUAN;
  return (
    <select className={className} style={style} value={value} onChange={(e) => onChange(e.target.value)} title="Lý do phát sinh: chỉ 4 giá trị chuẩn">
      <option value="">Chọn lý do</option>
      {ds.map((x) => <option key={x} value={x}>{x}</option>)}
      {value && !ds.includes(value) && <option value={value}>{value} (chưa chuẩn — hệ thống tự quy đổi nếu nhận ra)</option>}
    </select>
  );
}
