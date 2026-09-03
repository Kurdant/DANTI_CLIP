import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { LoginPage } from "./pages/Login";
import { RegisterPage } from "./pages/Register";
import { DashboardPage } from "./pages/Dashboard";
import { ProjectPage } from "./pages/Project";
import { setCsrf } from "./api";
import { useEffect } from "react";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading, csrf } = useAuth();
  useEffect(() => {
    if (csrf) setCsrf(csrf);
  }, [csrf]);

  if (loading) return <div className="center">Chargement…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/project/:id" element={<Protected><ProjectPage /></Protected>} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
