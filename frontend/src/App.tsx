import { Routes, Route, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api/client";
import { AppShell } from "./components/AppShell";
import { QuickViewProvider } from "./components/quickview/QuickView";
import { Spinner } from "./components/ui";
import Dashboard from "./pages/Dashboard";
import EoList from "./pages/eo/EoList";
import EoDetail from "./pages/eo/EoDetail";
import EoForm from "./pages/eo/EoForm";
import Approvals from "./pages/Approvals";
import Plans from "./pages/Plans";
import KeHoachTuan from "./pages/KeHoachTuan";
import TheoDoiLinhKien from "./pages/theodoi/TheoDoiLinhKien";
import CanhBaoCeo from "./pages/theodoi/CanhBaoCeo";
import AmisImport from "./pages/amis/AmisImport";
import SoDonHang from "./pages/SoDonHang";
import BaoCaoGiaiDoan from "./pages/reports/BaoCaoGiaiDoan";
import ReportAmisKhongEo from "./pages/reports/ReportAmisKhongEo";
import ReportTuan from "./pages/reports/ReportTuan";
import ReportLuyKe from "./pages/reports/ReportLuyKe";
import Users from "./pages/admin/Users";
import Roles from "./pages/admin/Roles";
import DanhMuc from "./pages/admin/DanhMuc";
import SysConfig from "./pages/admin/SysConfig";
import Pending from "./pages/Pending";

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
        <Route path="/eo/:id" element={<EoDetail />} />
        <Route path="/eo/:id/edit" element={<EoForm key="edit" mode="edit" />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/plans" element={<Plans />} />
        <Route path="/plans/tuan" element={<KeHoachTuan />} />
        <Route path="/theo-doi" element={<TheoDoiLinhKien />} />
        <Route path="/canh-bao-ceo" element={<CanhBaoCeo />} />
        <Route path="/amis" element={<AmisImport />} />
        {/* "Tien do don hang" da thay bang So don hang (cung du lieu + chon cot / loc / giai doan) - giu duong dan cu */}
        <Route path="/so-don-hang" element={<SoDonHang />} />
        <Route path="/reports/giai-doan" element={<BaoCaoGiaiDoan />} />
        <Route path="/reports/tien-do-don-hang" element={<SoDonHang />} />
        <Route path="/reports/amis-khong-eo" element={<ReportAmisKhongEo />} />
        <Route path="/reports/tien-do-tuan" element={<ReportTuan />} />
        <Route path="/reports/luy-ke-nam" element={<ReportLuyKe />} />
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
