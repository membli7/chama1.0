import { useAuth } from "./context/AuthContext.jsx";
import LegacyPage from "../LegacyPage.jsx";
import LandingPage from "./pages/LandingPage.jsx";

export default function DashboardEntry() {
  const { authenticated, loading } = useAuth();
  if (loading) {
    return <main role="status" className="react-root">Loading Jirani Chama…</main>;
  }
  return authenticated ? <LegacyPage pageKey="dashboard" /> : <LandingPage />;
}
