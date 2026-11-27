import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { nowVN } from "../lib/vnTime";
import { isViewOnly, xemToanBoTheoDoi } from "../lib/eoAccess";
import { danhGiaQuyTac, layDongTheoDoi } from "../lib/theoDoi";
import { dsLoiDayDu } from "../lib/baoCaoLoi";
import { layGiaiDoan } from "../lib/giaiDoan";

/**
 * GET /api/loi-po - man "Lỗi theo PO" (v0.138, Giam doc 2026-11-27: "1s phai biet ngay mac loi gi ... loi doi tac / noi bo ... loc theo ma loi ...
 * PO dat hang - LK trong PO - cac giai doan - loi theo tung giai doan - ai loi - noi bo / doi tac - SL dat / ve / thieu / ty le dap ung -
 * ai vi pham, vi pham loi gi, bao nhieu lan"). 1 payload phang, FE tu loc + gom (theo PO / ma loi / ai loi):
 *   dong: moi dong LK trong pham vi theo doi (PO ban hanh tu theo_doi_bo_qua_truoc) + giai doan hien tai + SL dat / ve / thieu
 *   loi : moi LAN loi (ban ghi tl_loi, dsLoiDayDu) tru loi "vi pham cu" da bo (AUTO:CU): ma ER.MH, giai doan (buoc), ben NCC / NOI_BO,
 *         ai loi (ben NCC = ten NCC, noi bo = nguoi phai giai trinh), trang thai CHO / VI_PHAM / DA_GT / KHAC_PHUC.
 * Pham vi xem giong man Vi pham: xem toan bo / chi xem -> tat ca; con lai: dong minh dat, loi cua minh, kho minh phu trach.
 */
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/** Pham vi xem (giong man Vi pham): xem toan bo / chi xem -> tat ca; con lai dong minh dat, loi cua minh, kho minh phu trach. */
function phamViXem(u: AppVariables["user"]) {
  const tatCa = xemToanBoTheoDoi(u) || isViewOnly(u);
  const khoCua = (u.khu_vuc_kho ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const thay = (nguoiDat: string | null, nguoiVp: string | null, kho: string) =>
    tatCa || nguoiDat === u.email || nguoiVp === u.email || (u.vai_tro === "Kho" && (khoCua.length === 0 || khoCua.includes(kho)));
  return { tatCa, thay };
}
/** v0.143 (chu he thong 2026-11-27 "Da chot bo loi tu truoc 20/11 roi ma? ... khong luu nguyen tac a?" - noi tiep v0.128 bo vi pham truoc dao tao 20/11):
 *  man Loi theo PO + so dem menu CHI tinh loi co MOC (han, khong co thi luc ghi) tu ngay dao tao 20/11/2026. Loi truoc moc (ke ca da giai trinh / tu khac phuc) khong hien. */
export const LOI_TINH_TU = "2026-11-20";
const tinhLoi = (l: any) => l.tu_dong !== "CU" && String(l.han ?? l.created_at) >= LOI_TINH_TU;
const ttLoi = (l: any) => (l.vi_pham ? "VI_PHAM" : l.trang_thai === "CHO_GIAI_TRINH" ? "CHO" : l.tu_dong ? "KHAC_PHUC" : "DA_GT");

/**
 * GET /dem (v0.142, chu he thong 2026-11-27 "loi theo PO cung chia theo cac menu phu"): so LAN loi cho so dem menu phu / cap 2 (FE lib/nav.ts khoa "loi:...").
 * Khoa: "" tong · NCC / NOI_BO · CHO / VI_PHAM · "gd|G5" · "NCC|ER.MH-004" / "NOI_BO|ER.MH-003". Cung pham vi + cung bo "vi pham cu" (AUTO:CU) voi GET /.
 */
app.get("/dem", async (c) => {
  const { thay } = phamViXem(c.get("user"));
  const { rows } = await dsLoiDayDu(c.env);
  const out: Record<string, number> = {};
  const cong = (k: string) => { out[k] = (out[k] ?? 0) + 1; };
  for (const l of rows) {
    if (!tinhLoi(l) || !thay(l.nguoi_dat, l.nguoi_vp, l.kho)) continue;
    cong(""); cong(l.ben); cong(ttLoi(l)); if (l.buoc) cong(`gd|${l.buoc}`); cong(`${l.ben}|${l.ma_loi}`);
  }
  return c.json(out);
});

app.get("/", async (c) => {
  const u = c.get("user");
  await danhGiaQuyTac(c.env).catch((e) => console.error("danhGiaQuyTac", e));
  const [{ rows: loiAll }, dongAll, gd, users] = await Promise.all([
    dsLoiDayDu(c.env), layDongTheoDoi(c.env, "tat_ca"), layGiaiDoan(c.env),
    c.env.DB.prepare("SELECT email, ho_ten FROM users").all<{ email: string; ho_ten: string }>(),
  ]);
  const { tatCa, thay } = phamViXem(u);
  const tenBy = new Map(users.results.map((x) => [x.email.toLowerCase(), x.ho_ten || x.email]));
  const ten = (e: string | null) => (e ? tenBy.get(e.toLowerCase()) ?? e : "");

  const loi = loiAll.filter((l) => tinhLoi(l) && thay(l.nguoi_dat, l.nguoi_vp, l.kho)).map((l) => {
    const tt = ttLoi(l);
    return {
      id: l.id as number, i: l.eo_item_id as number, e: l.eo_id as number, ma: l.ma_loi as string, ten: l.ten_ma as string, gd: (l.buoc as string | null) ?? "",
      ben: l.ben as "NCC" | "NOI_BO",
      ai: l.ben === "NCC" ? `NCC · ${l.doi_tac || "?"}` : ten(l.nguoi_vp),
      tt, ngay: String(l.han ?? l.created_at).slice(0, 10),
    };
  });
  const coLoi = new Set(loi.map((l) => l.i));
  const dong: Record<string, unknown>[] = dongAll.filter((d) => coLoi.has(d.item_id) || thay(d.nguoi_dat, null, d.kho)).map((d) => {
    const g = gd.map.get(d.item_id);
    return {
      i: d.item_id, e: d.eo_id, po: d.ma_phe_duyet || d.eo_code, lk: d.part_code, ten_lk: d.part_name, kho: d.kho, ncc: d.doi_tac ?? "",
      nguoi_dat: ten(d.nguoi_dat), ngay_bh: (d.ngay_ban_hanh ?? "").slice(0, 10), gd: g?.gd_hien_tai ?? "", gd_ten: g?.gd_hien_tai_ten ?? "",
      dat: d.so_luong_dat ?? 0, ve: d.sl_nhap_amis ?? 0, thieu: d.so_luong_con_thieu ?? 0,
    };
  });
  // dong co loi nhung ngoai pham vi theo doi (R5 cham duyet o PO chua ban hanh) -> dong toi thieu tu ban ghi loi
  const daCo = new Set(dong.map((d) => d.i as number));
  for (const l of loiAll) {
    if (!coLoi.has(l.eo_item_id) || daCo.has(l.eo_item_id)) continue;
    daCo.add(l.eo_item_id);
    dong.push({ i: l.eo_item_id, e: l.eo_id, po: l.approval_code || l.eo_code, lk: l.part_code, ten_lk: l.part_name, kho: l.kho, ncc: l.doi_tac ?? "",
      nguoi_dat: ten(l.nguoi_dat), ngay_bh: "", gd: "G3", gd_ten: "Duyệt mua & ban hành", dat: l.so_luong_dat ?? 0, ve: l.sl_ve ?? 0, thieu: l.so_luong_dat ?? 0 });
  }
  return c.json({ luc: nowVN(), tat_ca: tatCa, dong, loi, tinh_tu: LOI_TINH_TU });
});

export default app;
