/**
 * Tham so loc NHIEU gia tri (nguyen tac 2026-11-18: moi bo loc cho tick nhieu lua chon).
 * FE `components/ChonNhieu.tsx` noi cac gia tri bang "|" (vd ?kho=Kho A|Kho B). 1 gia tri (link / bo loc da luu cu) van dung.
 */
export const dsThamSo = (s: string | null | undefined): string[] =>
  (s ?? "").split("|").map((x) => x.trim()).filter(Boolean);
