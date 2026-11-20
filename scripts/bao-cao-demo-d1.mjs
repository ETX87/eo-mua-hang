import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = async (name) => JSON.parse(await readFile(resolve(root, "demo-d1-" + name + ".json"), "utf8"));
const [main, supplement, background, popups, popupEo, plans] = await Promise.all([
  read("ket-qua"), read("bo-sung"), read("tai-nen"), read("popup"), read("popup-eo"), read("lk-va-ke-hoach"),
]);
const fmt = (num) => Math.round(num).toLocaleString("vi-VN");
const sum = (requests, key) => requests.reduce((n, request) => n + request[key], 0);
const screen = (years, name, phase) => {
  const actionRoute = {
    "Quick view linh kiện": "/api/xem/linh-kien",
    "Quick view dòng": "/api/theo-doi/dong/",
    "ETX nhân sự": "/api/etx-nhan-su",
    "Thông báo": "/api/notifications",
  }[name];
  const essentialRoute = {
    "LK đặt": "/api/so-don-hang",
    "Kế hoạch tuần theo PO": "/api/plans/lines",
  }[name];
  const runs = name === "LK đặt" ? [main, plans, popups, supplement] : [popupEo, plans, popups, supplement, main];
  let partial = null;
  for (const run of runs) {
    const records = run.find((entry) => entry.years === years)?.screens;
    const item = records?.find((entry) => entry.name === name && entry.phase === phase);
    if (!item || item.errors.length) continue;
    const repeat = records.find((entry) => entry.name === name && entry.phase === "repeat");
    const repeatStart = repeat?.initial.findIndex((request) => request.path === "/api/users/me") ?? -1;
    // A route cannot issue queries before the fresh page receives /users/me.
    const initial = repeatStart > 0
      ? (phase === "first" ? [...item.initial, ...repeat.initial.slice(0, repeatStart)] : item.initial.slice(repeatStart))
      : item.initial;
    if (!good([...initial, ...item.interaction])) continue;
    if (actionRoute && !item.interaction.some((r) => r.path.startsWith(actionRoute))) continue;
    if (essentialRoute && !initial.some((r) => r.path === essentialRoute)) continue;
    const record = { ...item, initial };
    if (initial.some((r) => r.path === "/api/viec-can-lam")) return record;
    partial ??= record;
  }
  if (name === "LK đặt") {
    const parent = screen(years, "Quick view dòng", phase);
    if (parent?.initial.some((r) => r.path === "/api/so-don-hang")) return { ...parent, interaction: [] };
  }
  if (partial) {
    const polling = event(years, "Polling Việc cần làm")?.requests ?? [];
    return { ...partial, initial: [...partial.initial, ...polling], supplementalPoll: true };
  }
  return null;
};
const event = (years, name) => {
  const priority = name === "Quick view linh kiện qua API"
    ? [popups, supplement, main]
    : [background, popups, supplement, main];
  for (const run of priority) {
    const item = run.find((entry) => entry.years === years)?.events.find((entry) => entry.name === name);
    if (item) return item;
  }
  if (name === "Dựng cache Sổ đơn hàng từ đầu" && years === 3) {
    // In the events-only run this lookup is the first endpoint that ensures the row cache.
    return background.find((entry) => entry.years === years)?.events.find((entry) => entry.name === "Quick view linh kiện qua API");
  }
  return null;
};
const good = (requests) => requests.length && requests.every((r) => r.status < 400);
const fmtRw = (r) => good(r) ? fmt(sum(r, "reads")) + " / " + fmt(sum(r, "writes")) : "Lỗi hoặc thiếu số đo";
const row = (...cells) => "| " + cells.join(" | ") + " |";
const period = [1, 3, 5];

const recommendations = {
  "Tổng quan": "Dùng số tổng hợp theo phạm vi xem; tải thẻ chi tiết theo nhu cầu.",
  "Đơn PO": "Lọc và phân trang tại API; dùng cột chuẩn hóa cho tìm không dấu.",
  "Việc cần duyệt": "Truy vấn theo người và trạng thái; giảm phụ thuộc tập dữ liệu Đơn PO.",
  "Tạo EO": "Tải gợi ý danh mục theo nhu cầu; lưu phiếu với khóa chống gửi trùng.",
  "Sửa EO": "Gom header và thay đổi dòng; kiểm tra version khi lưu.",
  "LK đặt": "Cập nhật cache theo dòng bị ảnh hưởng; phân trang máy chủ.",
  "Chi tiết EO": "Tải từng tab theo yêu cầu; làm mới đúng dữ liệu của PO.",
  "Quick view linh kiện": "Đánh chỉ mục mã chuẩn hóa; phân trang lịch sử AMIS.",
  "Quick view dòng": "Giữ truy vấn theo ID; đo riêng chi phí mở popup.",
  "Kế hoạch tuần": "Giới hạn tập chọn EO và hiển thị tổng kết quả.",
  "Kế hoạch tuần theo PO": "Giữ phạm vi PO; kiểm tra tổng số lượng lúc ghi.",
  "Báo cáo giai đoạn": "Tổng hợp theo kỳ; tải chi tiết khi lọc hoặc mở nhóm.",
  "Tiến độ tuần": "Tổng hợp theo khóa kỳ; thu hẹp phạm vi dựng lại.",
  "Lũy kế năm": "Đọc bảng tổng hợp của năm được chọn.",
  "Điều hành": "Dùng chung kết quả tổng hợp và tách tính luật khỏi lượt đọc.",
  "Ca CEO": "Đọc tập ứng viên theo chỉ mục và phân trang chi tiết.",
  "Vi phạm": "Lọc quyền theo người, kho, PO trước khi tải; phân trang.",
  "Bảng mã lỗi": "Tách danh mục ít đổi khỏi bộ đếm và chia sẻ số tổng hợp.",
  "Nhập AMIS": "Tách bộ đếm badge; đối soát theo mã ảnh hưởng và chỉ ghi thay đổi.",
  "AMIS chưa khớp": "Lọc kỳ và kho tại API; tách tổng số khỏi danh sách.",
  "Người dùng": "Phân trang khi danh bạ lớn; tái sử dụng dữ liệu phiên.",
  "ETX nhân sự": "Giữ phân trang; đo riêng đồng bộ tại staging.",
  "Vai trò": "Xác minh quyền tại API theo từng vai trò trước triển khai.",
  "Danh mục": "Xem trước số dòng tác động của thao tác chuẩn hóa hàng loạt.",
  "Cấu hình": "Tải trạng thái tích hợp khi mở tab; cache dữ liệu ít đổi.",
  "Thông báo": "Tải danh sách khi bấm chuông; gộp polling badge nếu phù hợp.",
};
const mixes = {
  "Tổng quan": 25, "Đơn PO": 25, "LK đặt": 15, "Chi tiết EO": 10, "Nhập AMIS": 5,
  "Điều hành": 5, "Vi phạm": 5, "Báo cáo giai đoạn": 5, "Kế hoạch tuần": 5,
};
const scenarios = [
  { label: "Nhẹ", users: 10, views: 8, minutes: 30, builds: 2, evaluations: 6 },
  { label: "Cơ sở", users: 25, views: 12, minutes: 120, builds: 5, evaluations: 24 },
  { label: "Cao", users: 50, views: 20, minutes: 240, builds: 15, evaluations: 48 },
];
function eventTotal(years, name, key) {
  const item = event(years, name);
  if (!item || !good(item.requests)) throw new Error("Thiếu số đo " + name + " năm " + years);
  return sum(item.requests, key);
}
function costs(years, scenario, key) {
  if (years === 4) {
    const a = costs(3, scenario, key);
    return costs(5, scenario, key).map((v, i) => (v + a[i]) / 2);
  }
  const unit = Object.entries(mixes).reduce((n, [name, weight]) => {
    const item = screen(years, name, "repeat");
    if (!item) throw new Error("Thiếu số đo màn " + name + " năm " + years);
    return n + weight / 100 * sum([...item.initial, ...item.interaction], key);
  }, 0);
  const polling = eventTotal(years, "Polling Việc cần làm", key) + eventTotal(years, "Polling chuông", key) / 2;
  return [
    unit * scenario.users * scenario.views,
    polling * scenario.users * scenario.minutes,
    eventTotal(years, "Mở một PO sau đổi version EO", key) * scenario.builds,
    eventTotal(years, "Đánh giá định kỳ sau khi đã có dữ liệu", key) * scenario.evaluations,
  ];
}

const cases = [...new Set([...main, ...supplement, ...background, ...popups].flatMap((r) => r.events.map((e) => e.name)))];
const five = costs(5, scenarios[1], "reads");
const budget = 5_000_000;
const projectedPollTuned = 25 * 120 * (200 / 5 + 28 / 2);
const afterPoll = five[0] + projectedPollTuned + five[2] + five[3];
const hotScreens = Object.keys(recommendations).map((name) => {
  const data = screen(5, name, "repeat");
  return data ? { name, reads: sum([...data.initial, ...data.interaction], "reads") } : null;
}).filter(Boolean).sort((a, b) => b.reads - a.reads).slice(0, 5);
const lines = [
  "# Demo sức tải D1 cho EO Mua Hàng",
  "",
  "Frontend build từ mã hiện tại, Chrome headless, Worker Hono và D1 qua Miniflare. Dữ liệu tạo từ 24 migration và fixture tổng hợp. Mỗi ca dùng hồ sơ Chrome riêng và tải lại một lần. Các ca cùng mốc dùng cache máy chủ theo thứ tự chạy. Lượt mở đầu có thể hưởng cache do màn trước tạo.",
  "",
  "Số liệu lấy từ meta.rows_read và meta.rows_written, bao gồm tác vụ nền. Bộ đo lấy metadata cho phương thức first() bằng all() rồi chọn dòng đầu. Điều này có thể tăng số đo ở truy vấn trả nhiều dòng. Bản đo đợi các việc nền hoàn tất trước khi trả HTTP để thu đủ metadata, vì vậy thời gian trên Chrome local chỉ dùng chẩn đoán. Demo dùng Admin local và không sử dụng kết nối hay dữ liệu production. Miniflare không thực thi mọi giới hạn của Cloudflare.",
  "",
  row("Mốc", "EO", "Dòng linh kiện", "Dòng AMIS", "Kế hoạch", "Vi phạm ban đầu"),
  row("---", "---:", "---:", "---:", "---:", "---:"),
  ...main.map(({ years, counts: c }) => row(years + " năm", ...[c.eo, c.items, c.amis, c.plans, c.violations].map(fmt))),
  "",
  "## Kết quả từng màn hình",
  "",
  "Mỗi ô là số dòng **đọc / ghi**. Mở lại vẫn tải lại ứng dụng và gọi API. Lượt mở popup gồm cả màn cha. Popup dòng mở từ LK đặt. Popup linh kiện ở năm 1 và 3 mở từ LK đặt, ở năm 5 mở từ chi tiết EO khi chạy lại. Thông báo đo cùng Tổng quan. ETX được mở từ Người dùng.",
  "",
  "Nếu request của màn hình cũ hoàn tất trước khi phiên tải lại xác thực xong qua /api/users/me, báo cáo tính request đó cho lượt mở trước. Trường hợp này thấy ở lượt tạo cache gợi ý danh mục của Đơn PO năm 5.",
  "",
  "Dấu † cho biết lượt mở có API màn hình đã được đo, còn chi phí badge được bổ sung từ lần đo riêng cùng mốc do trace trình duyệt thiếu bản ghi này.",
  "",
  "Các lượt mở lại đọc nhiều nhất ở năm 5 gồm " + hotScreens.map((item) => item.name + " (" + fmt(item.reads) + " dòng)").join(", ") + ". Những ca đã làm nóng cache trước được giải thích ở phần tải nền.",
  "",
  row("Màn hình", "Năm 1 mở lại", "Năm 3 mở đầu", "Năm 3 mở lại", "Năm 5 mở đầu", "Năm 5 mở lại", "Giải pháp"),
  row("---", "---:", "---:", "---:", "---:", "---:", "---"),
  ...Object.entries(recommendations).map(([name, recommendation]) => {
    const cols = [[1, "repeat"], [3, "first"], [3, "repeat"], [5, "first"], [5, "repeat"]].map(([y, phase]) => {
      const item = screen(y, name, phase);
      return item ? fmtRw([...item.initial, ...item.interaction]) + (item.supplementalPoll ? " †" : "") : "—";
    });
    return row(name, ...cols, recommendation);
  }),
  "",
  "## Tải nền, cache và bảo trì",
  "",
  row("Ca đo", "Năm 1 đọc / ghi", "Năm 3 đọc / ghi", "Năm 5 đọc / ghi"),
  row("---", "---:", "---:", "---:"),
  ...cases.map((name) => row(name, ...period.map((y) => {
    const item = event(y, name);
    return item ? fmtRw(item.requests) : "—";
  }))),
  "",
  "Lượt đánh giá đầu mô phỏng xử lý dữ liệu tồn. Lượt định kỳ sau đó lùi mốc đánh giá 20 phút trên DB demo, giữ nguyên dữ liệu nghiệp vụ. Ca đổi version chỉ tăng version EO. Ca tám yêu cầu dùng chung một version mới. Ca đối soát toàn bộ là thao tác chủ động nằm ngoài lượt xem.",
  "",
  ...background.filter((x) => x.localStorageBytes > 0).map((x) =>
    "- Dữ liệu và cache theo dòng tại mốc " + x.years + " năm chiếm khoảng " + fmt(x.localStorageBytes / 1_000_000) + " MB trong D1 local. Fixture có ít nhật ký và tài liệu."),
  "",
  "## Dự báo 3–5 năm",
  "",
  "Tăng 600 EO và 4.800 dòng linh kiện mỗi năm. Mô hình dùng lượt mở lại, cộng polling khi tab hoạt động, lượt dựng lại sau đổi version và lượt chạy đánh giá. Tỷ trọng mở màn gồm 25% Tổng quan, 25% Đơn PO, 15% LK đặt, 10% Chi tiết EO và 5% mỗi nhóm còn lại gồm Nhập AMIS, Điều hành, Vi phạm, Báo cáo giai đoạn và Kế hoạch tuần. Năm 4 nội suy giữa hai mốc đo.",
  "",
  row("Kịch bản", "Người/ngày", "Lượt mở/người", "Phút tab hoạt động/người/ngày", "Dựng cache/ngày", "Đánh giá/ngày"),
  row("---", "---:", "---:", "---:", "---:", "---:"),
  ...scenarios.map((s) => row(s.label, s.users, s.views, s.minutes, s.builds, s.evaluations)),
  "",
  row("Năm", "Kịch bản", "Đọc mở màn/ngày", "Đọc polling/ngày", "Đọc dựng cache/ngày", "Đọc đánh giá/ngày", "Tổng đọc/ngày", "Đọc/tháng 22 ngày", "Ghi kỹ thuật/ngày"),
  row("---:", "---", "---:", "---:", "---:", "---:", "---:", "---:", "---:"),
  ...[3, 4, 5].flatMap((years) => scenarios.map((s) => {
    const r = costs(years, s, "reads");
    const w = costs(years, s, "writes");
    const total = r.reduce((a, b) => a + b, 0);
    return row(years, s.label, ...r.map(fmt), fmt(total), fmt(total * 22), fmt(w.reduce((a, b) => a + b, 0)));
  })),
  "",
  "Dự báo cộng dồn tải lần mở và polling. Điều hướng SPA có thể tái sử dụng cache và giảm phần tải lần mở. Worker isolate lạnh, dữ liệu tồn, tải nhiều màn sau đổi version và thêm thiết bị mới có thể làm số thực tế cao hơn. Ghi nghiệp vụ, nhập hàng loạt, đối soát toàn bộ và lưu lượng những ứng dụng khác cần cộng riêng.",
  "",
  "Trong kịch bản cơ sở năm 5, polling đóng góp " + fmt(five[1]) + " dòng đọc/ngày. Nếu badge Việc cần làm đạt 200 dòng/lượt và chỉ gọi mỗi 5 phút, polling còn khoảng " + fmt(projectedPollTuned) + " dòng/ngày, kể cả chuông. Tổng còn khoảng " + fmt(afterPoll) + " dòng/ngày khi giữ nguyên phần còn lại. " + (afterPoll > budget ? "Vẫn vượt quota Free. Cần tiếp tục giảm truy vấn mở màn và phạm vi dựng cache." : "So sánh lại với quota tài khoản sau khi đo thêm phần tải nghiệp vụ.") + " Đây là mục tiêu thiết kế; chưa chạy trên mã đã tối ưu.",
  "",
  "## Cảnh báo và lộ trình",
  "",
  "1. **Ngay bây giờ.** Gắn số đo đọc, ghi theo route và theo nguồn kích hoạt. Đặt cảnh báo ở 50%, 70% và 85% quota. Ưu tiên bộ đếm Việc cần làm theo người và truy vấn ứng viên đến hạn có chỉ mục. Khi tách xử lý khỏi GET, giữ lịch kiểm tra nghiệp vụ độc lập. Kiểm tra chi phí badge trên cùng fixture trước và sau thay đổi.",
  "2. **Trước khi mở rộng.** Đưa dựng cache vào tiến trình có khóa và quyền công bố nhất quán. Sửa AMIS chỉ ghi thay đổi. Thiết lập ngân sách riêng cho dựng lại và bảo trì. Kiểm tra đồng thời luồng duyệt và kế hoạch để bảo vệ dữ liệu.",
  "3. **Năm 3 đến 5.** Giới hạn truy vấn thao tác theo kỳ hiện hành, phục vụ lịch sử qua bảng tổng hợp. Xem xét lưu trữ lịch sử riêng theo số đo. Chạy lại phép đo sau thay đổi kiến trúc hoặc khi lưu lượng tăng gấp đôi.",
  "4. **Bảo mật.** Kiểm tra quyền từng vai trò ở staging, khóa cache IndexedDB theo tài khoản và dọn khi đăng xuất. Rà soát link Drive có quyền công khai và thống nhất phạm vi đọc giữa danh sách, popup và lịch sử vi phạm. Đặt giới hạn cho tuyến công khai trước khi tách cơ chế kích hoạt tác vụ nền. OAuth, tích hợp ngoài và các thao tác commit nghiệp vụ cần kiểm thử riêng.",
  "",
  "Workers Free hiện có 5 triệu dòng đọc và 100.000 dòng ghi mỗi ngày, với tối đa 500 MB mỗi DB. Hạn mức ngày đặt lại lúc 07:00 giờ Việt Nam. Workers Paid gồm 25 tỷ dòng đọc và 50 triệu dòng ghi mỗi tháng trước phần vượt mức, với tối đa 10 GB mỗi DB. [Giá D1](https://developers.cloudflare.com/d1/platform/pricing/) · [Giới hạn D1](https://developers.cloudflare.com/d1/platform/limits/)",
  "",
  "Ở mốc 5 năm, ca dựng cache từ đầu và đối soát AMIS đều vượt riêng quota ghi của Free. Lượt đánh giá tồn vượt quota đọc của Free. Tám lượt mở PO sau đổi version cùng trả 200 trên local; ca này dùng một Miniflare, chưa đại diện cho nhiều isolate Cloudflare. Một lần chạy popup linh kiện với cache chưa dựng hết thời gian chờ 45 giây khi các ca chạy chồng nhau. Bảng trên ưu tiên lần đo lại sau khi làm nóng cache. Thời gian local chưa dùng làm cam kết tốc độ.",
  "",
  "Build frontend báo bundle chính khoảng 1,57 MB trước nén và 474 kB gzip. Tách tải Excel và màn quản trị theo route để giảm thời gian tải lần đầu, ngoài phần giảm đọc D1.",
  "",
  "## Chạy lại",
  "",
  "Chạy từ thư mục EO MUA HANG sau khi cài dependencies của repo và phụ thuộc Puppeteer trong huong-dan/_build. Nếu Chrome được cài ở vị trí khác, đặt biến D1_DEMO_BROWSER. Trình chạy chỉ bind HTTP trên 127.0.0.1 và dùng DB Miniflare tạm.",
  "",
  "```powershell",
  "npm.cmd run build --prefix eomua",
  "node eomua/scripts/demo-d1.mjs",
  "",
  "$env:D1_DEMO_SCREENS = 'Quick view linh kiện|Quick view dòng|Kế hoạch tuần theo PO'",
  "$env:D1_DEMO_OUTPUT = 'demo-d1-bo-sung.json'",
  "$env:D1_DEMO_MUTATION = '1'",
  "node eomua/scripts/demo-d1.mjs 3 5",
  "Remove-Item Env:D1_DEMO_MUTATION",
  "",
  "$env:D1_DEMO_WARM_SDH = '1'",
  "$env:D1_DEMO_TIMEOUT_MS = '120000'",
  "$env:D1_DEMO_OUTPUT = 'demo-d1-popup.json'",
  "node eomua/scripts/demo-d1.mjs 1 5",
  "",
  "$env:D1_DEMO_SCREENS = 'Đơn PO|Điều hành|Ca CEO|Bảng mã lỗi|Thông báo|Quick view linh kiện'",
  "$env:D1_DEMO_PART_FROM_EO = '1'",
  "$env:D1_DEMO_OUTPUT = 'demo-d1-popup-eo.json'",
  "node eomua/scripts/demo-d1.mjs 5",
  "Remove-Item Env:D1_DEMO_PART_FROM_EO",
  "",
  "$env:D1_DEMO_SCREENS = 'LK đặt|Kế hoạch tuần theo PO'",
  "$env:D1_DEMO_OUTPUT = 'demo-d1-lk-va-ke-hoach.json'",
  "node eomua/scripts/demo-d1.mjs 5",
  "Remove-Item Env:D1_DEMO_SCREENS, Env:D1_DEMO_WARM_SDH, Env:D1_DEMO_TIMEOUT_MS",
  "",
  "$env:D1_DEMO_EVENTS_ONLY = '1'",
  "$env:D1_DEMO_OUTPUT = 'demo-d1-tai-nen.json'",
  "node eomua/scripts/demo-d1.mjs 3 5",
  "Remove-Item Env:D1_DEMO_EVENTS_ONLY, Env:D1_DEMO_OUTPUT",
  "node eomua/scripts/bao-cao-demo-d1.mjs",
  "```",
  "",
  "Số đo theo request nằm trong các tệp demo-d1-*.json. Bài chạy ở eomua/scripts/demo-d1.mjs.",
];
await writeFile(resolve(root, "BAO_CAO_DEMO_D1_3_5_NAM.md"), lines.join("\n") + "\n");
