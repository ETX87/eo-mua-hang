import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api/client";
import { AppShell } from "./components/AppShell";
import { QuickViewProvider } from "./components/quickview/QuickView";
import { Spinner } from "./components/ui";
import Dashboard from "./pages/Dashboard";
import EoList from "./pages/eo/EoList";
import EoForm from "./pages/eo/EoForm";
import KeHoachTuan from "./pages/KeHoachTuan";
import AmisImport from "./pages/amis/AmisImport";
import DonHang from "./pages/DonHang";
import Users from "./pages/admin/Users";
import Roles from "./pages/admin/Roles";
import DanhMuc from "./pages/admin/DanhMuc";
import SysConfig from "./pages/admin/SysConfig";
import Pending from "./pages/Pending";

/** Duong dan cu -> man moi, giu query string (link da gui / danh dau / Viec can xu ly cu khong chet). */
function ChuyenHuong({ to, them }: { to: string; them?: string }) {
  const { search } = useLocation();
  const qs = [search.replace(/^\?/, ""), them].filter(Boolean).join("&");
  return <Navigate to={qs ? `${to}?${qs}` : to} replace />;
}

interface Me { email: string; ho_ten: string; vai_tro: string | null; trang_thai_duyet: string; }

export default function App() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/users/me") });

  if (me.isLoading) return <Spinner text="Đang tải hệ thống…" />;
  if (me.data && me.data.trang_thai_duyet !== "Da duyet") return <Pending me={me.data} />;

  return (
    <QuickViewProvider>
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/eo" element={<EoList />} />
        <Route path="/eo/new" element={<EoForm key="create" mode="create" />} />
        {/* chi tiet EO = popup tren man Quan ly EO; /approvals -> chip "Cho toi duyet" (v0.051) */}
        <Route path="/eo/:id" element={<EoList />} />
        <Route path="/eo/:id/edit" element={<EoForm key="edit" mode="edit" />} />
        <Route path="/approvals" element={<ChuyenHuong to="/eo" them="chip=cho_toi_duyet" />} />
        {/* Quan ly don hang (v0.050) gop Theo doi / So don hang / Canh bao CEO / Ke hoach / 3 bao cao - duong dan cu chuyen huong */}
        <Route path="/don-hang" element={<DonHang />} />
        <Route path="/don-hang/ke-hoach-tuan" element={<KeHoachTuan />} />
        <Route path="/theo-doi" element={<ChuyenHuong to="/don-hang" />} />
        <Route path="/so-don-hang" element={<ChuyenHuong to="/don-hang" />} />
        <Route path="/reports/tien-do-don-hang" element={<ChuyenHuong to="/don-hang" />} />
        <Route path="/canh-bao-ceo" element={<ChuyenHuong to="/don-hang" them="nhom=CEO" />} />
        <Route path="/plans" element={<ChuyenHuong to="/don-hang" them="nhom=VE_TUAN" />} />
        <Route path="/plans/tuan" element={<ChuyenHuong to="/don-hang/ke-hoach-tuan" />} />
        <Route path="/reports/giai-doan" element={<ChuyenHuong to="/don-hang" them="tab=bao-cao&bc=giai-doan" />} />
        <Route path="/reports/tien-do-tuan" element={<ChuyenHuong to="/don-hang" them="tab=bao-cao&bc=tien-do-tuan" />} />
        <Route path="/reports/luy-ke-nam" element={<ChuyenHuong to="/don-hang" them="tab=bao-cao&bc=luy-ke-nam" />} />
        <Route path="/amis" element={<AmisImport />} />
        <Route path="/reports/amis-khong-eo" element={<ChuyenHuong to="/amis" them="tab=chua-khop" />} />
        <Route path="/admin/users" element={<Users />} />
        <Route path="/admin/roles" element={<Roles />} />
        <Route path="/admin/danh-muc" element={<DanhMuc />} />
        <Route path="/admin/cau-hinh" element={<SysConfig />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
    </QuickViewProvider>
  );
}
