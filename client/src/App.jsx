import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { getToken, setToken } from "./api.js";
import { Layout } from "./ui.jsx";
import {
  ApplicationsPage,
  CabinetPage,
  ForbiddenPage,
  HistoryPage,
  LoginPage,
  PartnerCardPage,
  PartnersPage,
  ProgramCardPage,
  ProgramPartnersPage,
  ProgramsPage
} from "./pages.jsx";

const ADMIN_ROLES = ["admin", "superadmin"];

export default function App() {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("fin_uslovia_user");
    return raw ? JSON.parse(raw) : null;
  });
  const location = useLocation();

  useEffect(() => {
    if (!getToken()) setUser(null);
  }, [location.pathname]);

  function login(data) {
    setToken(data.token);
    localStorage.setItem("fin_uslovia_user", JSON.stringify(data.user));
    setUser(data.user);
  }

  function logout() {
    setToken(null);
    localStorage.removeItem("fin_uslovia_user");
    setUser(null);
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage onLogin={login} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const home = ADMIN_ROLES.includes(user.role) ? "/programs" : user.role === "partner" ? "/cabinet" : "/forbidden";

  return (
    <Layout user={user} onLogout={logout}>
      <Routes>
        <Route path="/" element={<Navigate to={home} replace />} />
        <Route path="/login" element={<Navigate to={home} replace />} />
        {ADMIN_ROLES.includes(user.role) ? (
          <>
            <Route path="/programs" element={<ProgramsPage user={user} />} />
            <Route path="/programs/:id" element={<ProgramCardPage />} />
            <Route path="/programs/:id/partners" element={<ProgramPartnersPage />} />
            <Route path="/partners" element={<PartnersPage />} />
            <Route path="/partners/:id" element={<PartnerCardPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/applications" element={<ApplicationsPage user={user} />} />
          </>
        ) : null}
        {user.role === "partner" ? (
          <>
            <Route path="/cabinet" element={<CabinetPage user={user} />} />
            <Route path="/applications" element={<ApplicationsPage user={user} />} />
          </>
        ) : null}
        <Route path="/forbidden" element={<ForbiddenPage user={user} onLogout={logout} />} />
        <Route path="*" element={<Navigate to={user.role === "manager" ? "/forbidden" : home} replace />} />
      </Routes>
    </Layout>
  );
}
