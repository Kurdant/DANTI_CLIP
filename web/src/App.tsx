import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { LoginPage } from "./pages/Login";
import { RegisterPage } from "./pages/Register";
import { DashboardPage } from "./pages/Dashboard";
import { NewProjectPage } from "./pages/NewProject";
import { ProjectPage } from "./pages/Project";
import { LandingPage } from "./pages/Landing";
import { LibraryPage } from "./pages/Library";
import { AutomationPage } from "./pages/Automation";
import { ConnectionsPage } from "./pages/Connections";
import { SettingsPage } from "./pages/Settings";
import { PrivacyPage } from "./pages/Privacy";
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
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/newproject" element={<Protected><NewProjectPage /></Protected>} />
      <Route path="/library" element={<Protected><LibraryPage /></Protected>} />
      <Route path="/automatisation" element={<Protected><AutomationPage /></Protected>} />
      <Route path="/connexions" element={<Protected><ConnectionsPage /></Protected>} />
      <Route path="/parametres" element={<Protected><SettingsPage /></Protected>} />
      <Route path="/project/:id" element={<Protected><ProjectPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
