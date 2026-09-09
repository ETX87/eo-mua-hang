import { Routes, Route, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api/client";
import { AppShell } from "./components/AppShell";
import { Spinner } from "./components/ui";
import Dashboard from "./pages/Dashboard";
import EoList from "./pages/eo/EoList";
import EoDetail from "./pages/eo/EoDetail";
import EoForm from "./pages/eo/EoForm";
import Approvals from "./pages/Approvals";
import Plans from "./pages/Plans";
import AmisImport from "./pages/amis/AmisImport";
import ReportTienDo from "./pages/reports/ReportTienDo";
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
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/eo" element={<EoList />} />
        <Route path="/eo/new" element={<EoForm mode="create" />} />
        <Route path="/eo/:id" element={<EoDetail />} />
        <Route path="/eo/:id/edit" element={<EoForm mode="edit" />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/plans" element={<Plans />} />
        <Route path="/amis" element={<AmisImport />} />
        <Route path="/reports/tien-do-don-hang" element={<ReportTienDo />} />
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
  );
}
