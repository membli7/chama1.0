// Updated App.jsx – uses React Router for navigation and removes legacy page templating.
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import RegisterPage from "./pages/RegisterPage.jsx";
import MemberLoginPage from "./pages/MemberLoginPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import DashboardEntry from "./DashboardEntry.jsx"; // to be created separately
import { Layout } from "./components/Layout.jsx";
import LegacyPage from "./LegacyPage.jsx"; // fallback during migration

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}> {/* shared layout */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/member-login.html" element={<MemberLoginPage />} />
          <Route path="/register.html" element={<RegisterPage />} />
          <Route path="/profile.html" element={<ProfilePage />} />
          {/* Auth‑protected dashboard entry point */}
          <Route path="/dashboard" element={<DashboardEntry />} />
          {/* Legacy catch‑all – retains old behavior while migration proceeds */}
          <Route path="*" element={<LegacyPage pageKey="dashboard" />} />
        </Route>
        {/* Redirect short .html routes without leading slash */
        <Route path="member-login.html" element={<Navigate to="/member-login.html" replace />} />
        <Route path="register.html" element={<Navigate to="/register.html" replace />} />
        <Route path="profile.html" element={<Navigate to="/profile.html" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
