import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import { pageTemplates } from "../pageTemplates.js"; // only dashboard needed here
import ChatPanel from "../components/ChatPanel.jsx";
import HelpGuide from "../components/HelpGuide.jsx";
import FinancialOverview from "../components/FinancialOverview.jsx";
import AttendancePanel from "../components/AttendancePanel.jsx";
import LoansPanel, { LoanRequestPanel } from "../components/LoansPanel.jsx";
import LedgerPanel from "../components/LedgerPanel.jsx";
import MemberDirectory from "../components/MemberDirectory.jsx";
import MonthClosePanel from "../components/MonthClosePanel.jsx";
import AuditLogPanel from "../components/AuditLogPanel.jsx";
import PenaltyPanel from "../components/PenaltyPanel.jsx";
import DividendsPanel from "../components/DividendsPanel.jsx";
import ElectionsPanel from "../components/ElectionsPanel.jsx";
import InviteMemberPanel from "../components/InviteMemberPanel.jsx";
import CashEntryPanel from "../components/CashEntryPanel.jsx";
import LeadershipPanel from "../components/LeadershipPanel.jsx";
import PinChangeOverlay from "../components/PinChangeOverlay.jsx";
import SimulatedPaymentInbox from "../components/SimulatedPaymentInbox.jsx";

// Set of legacy controller script names that may be referenced in HTML templates.
const legacyControllerNames = new Set(["chama.js", "contact.js"]);

function createPageModel(pageKey) {
  const parsed = new DOMParser().parseFromString(pageTemplates[pageKey], "text/html");
  const scripts = Array.from(parsed.body.querySelectorAll("script[src]") )
    .map(script => script.getAttribute("src"))
    .filter(Boolean)
    .filter(source => {
      const url = new URL(source, window.location.origin);
      return url.origin === window.location.origin && legacyControllerNames.has(url.pathname.split("/").pop());
    });
  parsed.body.querySelectorAll("script").forEach(script => script.remove());
  return { language: parsed.documentElement.lang || "en", title: parsed.title, bodyClass: parsed.body.className, markup: parsed.body.innerHTML, scripts };
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

export default function LegacyPage({ pageKey }) {
  const hostRef = useRef(null);
  const page = useMemo(() => createPageModel(pageKey), [pageKey]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    document.documentElement.lang = page.language;
    document.body.className = page.bodyClass;
    if (page.title) document.title = page.title;

    // Helper to mount a React component into a host element if present.
    const mount = (selector, Component, props = {}) => {
      const el = host.querySelector(selector);
      if (!el) return null;
      const root = createRoot(el);
      root.render(<Component {...props} />);
      return root;
    };

    const chatRoot = mount("#react-chat-root", ChatPanel);
    const helpGuideRoot = mount("#react-help-guide-root", HelpGuide);
    const financeTarget = host.querySelector("#react-finance-root");
    const dashboardRoot = mount("#react-dashboard-root", FinancialOverview, { financeTarget });
    const attendanceRoot = mount("#react-attendance-root", AttendancePanel);
    const loanRequestRoot = mount("#react-loan-request-root", LoanRequestPanel);
    const loansRoot = mount("#react-loans-root", LoansPanel);
    const ledgerRoot = mount("#react-ledger-root", LedgerPanel);
    const membersRoot = mount("#react-member-directory-root", MemberDirectory);
    const monthCloseRoot = mount("#react-month-close-root", MonthClosePanel);
    const auditRoot = mount("#react-audit-root", AuditLogPanel);
    const penaltyRoot = mount("#react-penalty-root", PenaltyPanel);
    const dividendsRoot = mount("#react-dividend-root", DividendsPanel);
    const electionsRoot = mount("#react-elections-root", ElectionsPanel);
    const inviteRoot = mount("#react-invite-root", InviteMemberPanel);
    const cashEntryRoot = mount("#react-payment-root", CashEntryPanel);
    const leadershipRoot = mount("#react-leadership-root", LeadershipPanel);
    const pinChangeRoot = mount("#react-pin-change-root", PinChangeOverlay);
    const simulatedPaymentRoot = mount("#react-simulated-payment-root", SimulatedPaymentInbox);

    let mounted = true;
    const loadedScripts = [];
    const loadControllers = async () => {
      try {
        for (const src of page.scripts) {
          const script = await loadClassicScript(src);
          loadedScripts.push(script);
          if (!mounted) break;
        }
      } catch {
        if (!mounted) return;
        const msg = document.createElement("p");
        msg.className = "notice error";
        msg.setAttribute("role", "alert");
        msg.textContent = "This page could not finish loading. Reload and try again.";
        host.prepend(msg);
      }
    };
    void loadControllers();

    return () => {
      mounted = false;
      // Unmount all roots if they exist.
      [chatRoot, helpGuideRoot, dashboardRoot, attendanceRoot, loanRequestRoot, loansRoot, ledgerRoot, membersRoot, monthCloseRoot, auditRoot, penaltyRoot, dividendsRoot, electionsRoot, inviteRoot, cashEntryRoot, leadershipRoot, pinChangeRoot, simulatedPaymentRoot].forEach(r => r?.unmount());
      loadedScripts.forEach(s => s.remove());
      document.body.querySelectorAll('script[data-chama-react-controller="true"]').forEach(s => s.remove());
    };
  }, [page]);

  // Render the raw HTML template as innerHTML.
  return <div className="react-root" ref={hostRef} dangerouslySetInnerHTML={{ __html: page.markup }} />;
}
