/**
 * DONG THEM SAU BAN HANH dang CHO DUYET (v0.124, chu he thong 2026-11-26: "don da ket thuc, bo viec duyet hoac tu choi").
 * 1 nguon duy nhat cho moi cho dem / liet ke viec cho duyet dong sau BH (approvals /count + /post-issue, viecCanLam, dieuHanh duyet treo,
 * dashboard, eo list so_dong_cho_duyet, xemNhanh, Cong nhiem vu eOffice gomViecChoDuyet): post_issue_status = PENDING VA dong con mo -
 * chua ket thuc som, khong huy, chua ve DU so luong (luy ke phieu nhap AMIS khop dong, bo phieu huy). Dong da ve du / ket thuc: khong con
 * la viec cho duyet (du lieu post_issue_status giu nguyen, khong ghi de). FE components/quickview/EoQuickView.tsx `dongKetThuc` khop.
 * a = alias bang eo_item.
 */
export const CHO_DUYET_SAU_BH_SQL = (a = "i") =>
  `(${a}.post_issue_status = 'PENDING' AND ${a}.line_status = 'ACTIVE' AND ${a}.ket_thuc_som_at IS NULL
    AND COALESCE((SELECT SUM(ar.qty_in) FROM amis_receipt ar WHERE ar.match_status = 'MATCHED_EO' AND ar.matched_eo_item_id = ${a}.id AND ar.voided_at IS NULL), 0) < ${a}.current_qty)`;
