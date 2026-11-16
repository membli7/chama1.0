import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { pageForPath, pageTemplates } from "./pageTemplates.js";
import RegisterPage from "./pages/RegisterPage.jsx";
import MemberLoginPage from "./pages/MemberLoginPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import HelpGuide from "./components/HelpGuide.jsx";
import FinancialOverview from "./components/FinancialOverview.jsx";
import AttendancePanel from "./components/AttendancePanel.jsx";
import LoansPanel, { LoanRequestPanel } from "./components/LoansPanel.jsx";
import LedgerPanel from "./components/LedgerPanel.jsx";
import MemberDirectory from "./components/MemberDirectory.jsx";
import MonthClosePanel from "./components/MonthClosePanel.jsx";
import AuditLogPanel from "./components/AuditLogPanel.jsx";
import PenaltyPanel from "./components/PenaltyPanel.jsx";
import DividendsPanel from "./components/DividendsPanel.jsx";
import ElectionsPanel from "./components/ElectionsPanel.jsx";
import InviteMemberPanel from "./components/InviteMemberPanel.jsx";
import CashEntryPanel from "./components/CashEntryPanel.jsx";
import LeadershipPanel from "./components/LeadershipPanel.jsx";
import PinChangeOverlay from "./components/PinChangeOverlay.jsx";
import SimulatedPaymentInbox from "./components/SimulatedPaymentInbox.jsx";

const legacyControllerNames = new Set([
  "chama.js",
  "contact.js",
]);

function createPageModel(pageKey) {
  const parsed = new DOMParser().parseFromString(pageTemplates[pageKey], "text/html");
  const scripts = Array.from(parsed.body.querySelectorAll("script[src]"))
    .map(script => script.getAttribute("src"))
    .filter(Boolean)
    .filter(source => {
      const url = new URL(source, window.location.origin);
      return url.origin === window.location.origin
        && legacyControllerNames.has(url.pathname.split("/").pop());
    });
  parsed.body.querySelectorAll("script").forEach(script => script.remove());

  return {
    language: parsed.documentElement.lang || "en",
    title: parsed.title,
    bodyClass: parsed.body.className,
    markup: parsed.body.innerHTML,
    scripts,
  };
}

function loadClassicScript(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = source;
    script.async = false;
    script.dataset.chamaReactController = "true";
    script.onload = () => resolve(script);
    script.onerror = () => reject(new Error("A page controller could not be loaded."));
    document.body.append(script);
  });
}

function LegacyPage({ pageKey }) {
  const hostRef = useRef(null);
  const page = useMemo(() => createPageModel(pageKey), [pageKey]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    document.documentElement.lang = page.language;
    document.body.className = page.bodyClass;
    if (page.title) document.title = page.title;

    const chatHost = host.querySelector("#react-chat-root");
    const chatRoot = chatHost ? createRoot(chatHost) : null;
    chatRoot?.render(<ChatPanel />);
    const helpGuideHost = host.querySelector("#react-help-guide-root");
    const helpGuideRoot = helpGuideHost ? createRoot(helpGuideHost) : null;
    helpGuideRoot?.render(<HelpGuide />);
    const dashboardHost = host.querySelector("#react-dashboard-root");
    const financeTarget = host.querySelector("#react-finance-root");
    const dashboardRoot = dashboardHost ? createRoot(dashboardHost) : null;
    dashboardRoot?.render(<FinancialOverview financeTarget={financeTarget} />);
    const attendanceHost = host.querySelector("#react-attendance-root");
    const attendanceRoot = attendanceHost ? createRoot(attendanceHost) : null;
    attendanceRoot?.render(<AttendancePanel />);
    const loanRequestHost = host.querySelector("#react-loan-request-root");
    const loanRequestRoot = loanRequestHost ? createRoot(loanRequestHost) : null;
    loanRequestRoot?.render(<LoanRequestPanel />);
    const loansHost = host.querySelector("#react-loans-root");
    const loansRoot = loansHost ? createRoot(loansHost) : null;
    loansRoot?.render(<LoansPanel />);
    const ledgerHost = host.querySelector("#react-ledger-root");
    const ledgerRoot = ledgerHost ? createRoot(ledgerHost) : null;
    ledgerRoot?.render(<LedgerPanel />);
    const membersHost = host.querySelector("#react-member-directory-root");
    const membersRoot = membersHost ? createRoot(membersHost) : null;
    membersRoot?.render(<MemberDirectory />);
    const monthCloseHost = host.querySelector("#react-month-close-root");
    const monthCloseRoot = monthCloseHost ? createRoot(monthCloseHost) : null;
    monthCloseRoot?.render(<MonthClosePanel />);
    const auditHost = host.querySelector("#react-audit-root");
    const auditRoot = auditHost ? createRoot(auditHost) : null;
    auditRoot?.render(<AuditLogPanel />);
    const penaltyHost = host.querySelector("#react-penalty-root");
    const penaltyRoot = penaltyHost ? createRoot(penaltyHost) : null;
    penaltyRoot?.render(<PenaltyPanel />);
    const dividendsHost = host.querySelector("#react-dividend-root");
    const dividendsRoot = dividendsHost ? createRoot(dividendsHost) : null;
    dividendsRoot?.render(<DividendsPanel />);
    const electionsHost = host.querySelector("#react-elections-root");
    const electionsRoot = electionsHost ? createRoot(electionsHost) : null;
    electionsRoot?.render(<ElectionsPanel />);
    const inviteHost = host.querySelector("#react-invite-root");
    const inviteRoot = inviteHost ? createRoot(inviteHost) : null;
    inviteRoot?.render(<InviteMemberPanel />);
    const cashEntryHost = host.querySelector("#react-payment-root");
    const cashEntryRoot = cashEntryHost ? createRoot(cashEntryHost) : null;
    cashEntryRoot?.render(<CashEntryPanel />);
    const leadershipHost = host.querySelector("#react-leadership-root");
    const leadershipRoot = leadershipHost ? createRoot(leadershipHost) : null;
    leadershipRoot?.render(<LeadershipPanel />);
    const pinChangeHost = host.querySelector("#react-pin-change-root");
    const pinChangeRoot = pinChangeHost ? createRoot(pinChangeHost) : null;
    pinChangeRoot?.render(<PinChangeOverlay />);
    const simulatedPaymentHost = host.querySelector("#react-simulated-payment-root");
    const simulatedPaymentRoot = simulatedPaymentHost ? createRoot(simulatedPaymentHost) : null;
    simulatedPaymentRoot?.render(<SimulatedPaymentInbox />);

    let mounted = true;
    const loadedScripts = [];
    const loadControllers = async () => {
      try {
        for (const source of page.scripts) {
          const script = await loadClassicScript(source);
          loadedScripts.push(script);
          if (!mounted) break;
        }
      } catch {
        if (!mounted) return;
        const message = document.createElement("p");
        message.className = "notice error";
        message.setAttribute("role", "alert");
        message.textContent = "This page could not finish loading. Reload and try again.";
        host.prepend(message);
      }
    };
    void loadControllers();

    return () => {
      mounted = false;
      chatRoot?.unmount();
      helpGuideRoot?.unmount();
      dashboardRoot?.unmount();
      attendanceRoot?.unmount();
      loanRequestRoot?.unmount();
      loansRoot?.unmount();
      ledgerRoot?.unmount();
      membersRoot?.unmount();
      monthCloseRoot?.unmount();
      auditRoot?.unmount();
      penaltyRoot?.unmount();
      dividendsRoot?.unmount();
      electionsRoot?.unmount();
      inviteRoot?.unmount();
      cashEntryRoot?.unmount();
      leadershipRoot?.unmount();
      pinChangeRoot?.unmount();
      simulatedPaymentRoot?.unmount();
      loadedScripts.forEach(script => script.remove());
      document.body.querySelectorAll('script[data-chama-react-controller="true"]').forEach(script => script.remove());
    };
  }, [page]);

  // The imported templates are trusted, repository-owned source markup; user data is never interpolated here.
  return <div className="react-root" ref={hostRef} dangerouslySetInnerHTML={{ __html: page.markup }} />;
}

function DashboardEntry() {
  const [authenticated, setAuthenticated] = useState(null);

  useEffect(() => {
    let active = true;
    const endSession = () => {
      if (active) setAuthenticated(false);
    };
    window.addEventListener("chama:session-ended", endSession);
    fetch("/api/session", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(response => response.ok ? response.json() : { authenticated: false })
      .then(session => {
        if (active) setAuthenticated(session?.authenticated === true);
      })
      .catch(() => {
        if (active) setAuthenticated(false);
      });
    return () => {
      active = false;
      window.removeEventListener("chama:session-ended", endSession);
    };
  }, []);

  if (authenticated === null) return <main className="react-root" role="status">Loading Jirani Chama…</main>;
  return authenticated ? <LegacyPage pageKey="dashboard" /> : <LandingPage />;
}

export default function App() {
  const pageKey = pageForPath(window.location.pathname);
  if (pageKey === "profile") return <ProfilePage />;
  if (pageKey === "memberLogin") return <MemberLoginPage />;
  if (pageKey === "register") return <RegisterPage />;
  if (pageKey === "dashboard") return <DashboardEntry />;
  return <LegacyPage pageKey={pageKey} />;
}
