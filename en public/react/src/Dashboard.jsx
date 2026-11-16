import React from 'react';
import ChatPanel from './components/ChatPanel.jsx';
import HelpGuide from './components/HelpGuide.jsx';
import FinancialOverview from './components/FinancialOverview.jsx';
import AttendancePanel from './components/AttendancePanel.jsx';
import LoansPanel, { LoanRequestPanel } from './components/LoansPanel.jsx';
import LedgerPanel from './components/LedgerPanel.jsx';
import MemberDirectory from './components/MemberDirectory.jsx';
import MonthClosePanel from './components/MonthClosePanel.jsx';
import AuditLogPanel from './components/AuditLogPanel.jsx';
import PenaltyPanel from './components/PenaltyPanel.jsx';
import DividendsPanel from './components/DividendsPanel.jsx';
import ElectionsPanel from './components/ElectionsPanel.jsx';
import InviteMemberPanel from './components/InviteMemberPanel.jsx';
import CashEntryPanel from './components/CashEntryPanel.jsx';
import LeadershipPanel from './components/LeadershipPanel.jsx';
import PinChangeOverlay from './components/PinChangeOverlay.jsx';
import SimulatedPaymentInbox from './components/SimulatedPaymentInbox.jsx';
import './pwa.css'; // any global styles needed

/**
 * Full dashboard rendered after authentication.
 * Mirrors the previous legacy page structure but is now a pure React component.
 */
export default function Dashboard() {
  return (
    <div className="dashboard">
      {/* Chat and guide are placed at the top as in the original layout */}
      <div id="react-chat-root"><ChatPanel /></div>
      <div id="react-help-guide-root"><HelpGuide /></div>

      {/* Main finance overview */}
      <div id="react-dashboard-root">
        <FinancialOverview />
      </div>

      {/* Other panels – layout can be adjusted as needed */}
      <div className="grid">
        <div id="react-attendance-root"><AttendancePanel /></div>
        <div id="react-loan-request-root"><LoanRequestPanel /></div>
        <div id="react-loans-root"><LoansPanel /></div>
        <div id="react-ledger-root"><LedgerPanel /></div>
        <div id="react-member-directory-root"><MemberDirectory /></div>
        <div id="react-month-close-root"><MonthClosePanel /></div>
        <div id="react-audit-root"><AuditLogPanel /></div>
        <div id="react-penalty-root"><PenaltyPanel /></div>
        <div id="react-dividend-root"><DividendsPanel /></div>
        <div id="react-elections-root"><ElectionsPanel /></div>
        <div id="react-invite-root"><InviteMemberPanel /></div>
        <div id="react-payment-root"><CashEntryPanel /></div>
        <div id="react-leadership-root"><LeadershipPanel /></div>
        <div id="react-pin-change-root"><PinChangeOverlay /></div>
        <div id="react-simulated-payment-root"><SimulatedPaymentInbox /></div>
      </div>
    </div>
  );
}
