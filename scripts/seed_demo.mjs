// Seed EO khop noi dung ban demo (Node xu ly UTF-8 dung). Chay khi worker dang chay o :8793.
const B = process.env.B || "http://localhost:8793/api";
const post = (p, body) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

// Nguoi dung dang xem = smarttrade.vp -> de "Viec can duyet" + badge hien: dat lam reviewer/final.
const ME = "smarttrade.vp@gmail.com";
const HOA = "nguyenthiphuonghoa87@gmail.com";

const SPECS = [
  { t: "Mua vật tư sản xuất tháng 6/2025", lh: "PO.D102.Khác", pb: "Phòng Tác Ngiệp KD", mode: "review", qty: 1250, dg: 1000 },
  { t: "Linh kiện máy CNC", lh: "PO.D102.Khác", pb: "Phòng kế hoạch cung ứng", mode: "final", qty: 860, dg: 3500 },
  { t: "Hóa chất vệ sinh công nghiệp", lh: "PO.D103.Khác", pb: "Phòng Tác Ngiệp KD", mode: "review", qty: 320, dg: 450 },
  { t: "Thiết bị văn phòng", lh: "PO.D103.Khác", pb: "Phòng Tác Ngiệp KD", mode: "final", qty: 210, dg: 9000 },
  { t: "Vật tư phụ trợ sản xuất", lh: "PO.D102.Khác", pb: "Phòng kế hoạch cung ứng", mode: "review", qty: 150, dg: 600 },
  { t: "Hóa chất tẩy rửa", lh: "PO.D103.Khác", pb: "Phòng Tác Ngiệp KD", mode: "final", qty: 480, dg: 300 },
  { t: "Bơm định lượng & phụ kiện", lh: "PO.D102.Khác", pb: "Kho vận Miền Bắc", mode: "review", qty: 640, dg: 1200 },
  { t: "Màng lọc RO thay thế", lh: "PO.D101.KRF & Livotec nước", pb: "Kho vận Miền Nam", mode: "final", qty: 900, dg: 800 },
];

for (const s of SPECS) {
  const cr = await post("/eo", {
    tieu_de: s.t, loai_hinh: s.lh, phong_ban: s.pb,
    final_approver_email: s.mode === "final" ? ME : HOA,
    items: [
      { part_code: "LK-DEMO-A", part_name: "Linh kiện chính", warehouse: "Kho 6803 - Q2 HCM", supplier: "KAROFI", current_qty: Math.round(s.qty * 0.6), don_gia_du_kien: s.dg },
      { part_code: "LK-DEMO-B", part_name: "Linh kiện phụ trợ", warehouse: "Kho 6804 - Nguyễn Hữu Thọ", supplier: "Mishio", current_qty: Math.round(s.qty * 0.4), don_gia_du_kien: Math.round(s.dg * 0.8) },
    ],
  });
  await post(`/eo/${cr.id}/submit`, { reviewers: s.mode === "review" ? [ME] : [] });
  console.log("seeded", cr.eo_code, "-", s.t, s.mode);
}
const inb = await fetch(B + "/approvals/inbox").then((r) => r.json());
const d = await fetch(B + "/dashboard/summary").then((r) => r.json());
console.log("inbox:", inb.length, "| KPI:", JSON.stringify(d.kpi));
