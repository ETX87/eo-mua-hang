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
