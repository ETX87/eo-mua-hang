import { useEffect, useRef, useState } from "react";

/**
 * LOP HIEN THI theo THU TU MO (v0.127, chu he thong 2026-11-26: "UI mo len lai bi hien phia sau UI cu").
 * Truoc: Modal co dinh z 200, popup xem nhanh (QuickView) z 80+ -> mo popup xem nhanh TU TRONG Modal thi popup nam duoi.
 * Nay: moi Modal / popup xem nhanh lay z = Z_GOC + (so lop dang mo + 1) * 10 luc mo -> cai mo sau luon nam tren; Esc chi dong lop tren cung.
 * O noi (bo loc cot .hop-loc, MenuXo...) dat z 2000 - luon tren moi lop.
 */
const Z_GOC = 200;
let dangMo: number[] = [];
let tiep = 0;

/** z cho lop sap mo (tinh luc ve lan dau). */
export const zLopMoi = () => Z_GOC + (dangMo.length + 1) * 10;
/** Dang ky lop dang mo (goi trong effect), tra id; huy bang boLop(id). */
export const dangKyLop = () => { const id = ++tiep; dangMo.push(id); return id; };
export const boLop = (id: number) => { dangMo = dangMo.filter((x) => x !== id); };
export const laTrenCung = (id: number | null) => id != null && dangMo[dangMo.length - 1] === id;

/** Hook cho 1 lop (Modal): z co dinh tu luc mo + id de biet co dang tren cung (Esc). */
export function useLop(): { z: number; id: React.MutableRefObject<number | null> } {
  const [z] = useState(zLopMoi);
  const id = useRef<number | null>(null);
  useEffect(() => {
    id.current = dangKyLop();
    return () => { if (id.current != null) boLop(id.current); id.current = null; };
  }, []);
  return { z, id };
}
