import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import UserDashboard from "./UserDashboard";
import DoctorDashboard from "./DoctorDashboard";

// ProtectedRoute already blocks rendering until loading=false and user is set,
// so by the time Dashboard mounts, role is guaranteed to be resolved.
const Dashboard = () => {
  const { role } = useAuth();

  if (role === "doctor") return <DoctorDashboard />;
  if (role === "user") return <UserDashboard />;

  // role is null but user is authenticated — role fetch failed or not provisioned
  return <Navigate to="/auth" replace />;
};

export default Dashboard;
