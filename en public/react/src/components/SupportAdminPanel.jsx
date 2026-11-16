import React, { useState, useEffect } from "react";

export default function SupportAdminPanel() {
  const [stats, setStats] = useState(null);
  const [agents, setAgents] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview"); // "overview" | "agents" | "reassign"
  const [notice, setNotice] = useState(null);

  // Create Agent modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [permissions, setPermissions] = useState({
    canAssign: true,
    canReassign: false,
    canChangePriority: true,
    canChangeStatus: true,
    canAddInternalNotes: true,
    canEscalate: true,
    canClose: true,
    canManageFaq: true,
    canViewCrossTenant: false,
  });
  const [creatingAgent, setCreatingAgent] = useState(false);

  // Reassign state
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [reassigning, setReassigning] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, agentsRes, ticketsRes] = await Promise.all([
        fetch("/api/support/admin/stats", { headers: { Accept: "application/json" } }),
        fetch("/api/support/admin/agents", { headers: { Accept: "application/json" } }),
        fetch("/api/support/tickets", { headers: { Accept: "application/json" } }),
      ]);

      if (statsRes.ok) setStats((await statsRes.json()).data);
      if (agentsRes.ok) setAgents((await agentsRes.json()).data || []);
      if (ticketsRes.ok) setTickets((await ticketsRes.json()).data || []);
    } catch (err) {
      console.error("Failed to load admin support data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateAgent = async (e) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !pin.trim()) return;

    setCreatingAgent(true);
    setNotice(null);
    try {
      const res = await fetch("/api/support/admin/agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "chama",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          pin: pin.trim(),
          permissions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create agent");

      setNotice({ type: "success", message: `Support agent ${name} created successfully.` });
      setName("");
      setPhone("");
      setEmail("");
      setPin("");
      setShowCreateModal(false);
      await loadData();
    } catch (err) {
      setNotice({ type: "error", message: err.message });
    } finally {
      setCreatingAgent(false);
    }
  };

  const handleUpdateAgentStatus = async (agentId, newStatus) => {
    setNotice(null);
    try {
      const res = await fetch(`/api/support/admin/agents/${agentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "chama",
          Accept: "application/json",
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update agent");

      setNotice({ type: "success", message: `Agent status changed to ${newStatus}.` });
      setAgents(prev => prev.map(a => a.id === agentId ? { ...a, status: newStatus } : a));
    } catch (err) {
      setNotice({ type: "error", message: err.message });
    }
  };

  const handleTogglePermission = async (agent, permKey) => {
    const updatedPerms = {
      ...agent.permissions,
      [permKey]: !agent.permissions?.[permKey],
    };
    try {
      const res = await fetch(`/api/support/admin/agents/${agent.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "chama",
          Accept: "application/json",
        },
        body: JSON.stringify({ permissions: updatedPerms }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update permissions");

      setNotice({ type: "success", message: `Updated permissions for ${agent.name}.` });
      setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, permissions: updatedPerms } : a));
    } catch (err) {
      setNotice({ type: "error", message: err.message });
    }
  };

  const handleReassignTicket = async (e) => {
    e.preventDefault();
    if (!selectedTicketId || !selectedAgentId) return;

    setReassigning(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/support/tickets/${selectedTicketId}/assign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "chama",
          Accept: "application/json",
        },
        body: JSON.stringify({ agentId: selectedAgentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to reassign ticket");

      const agent = agents.find(a => a.id === selectedAgentId);
      setNotice({ type: "success", message: `Ticket assigned to ${agent?.name || "agent"}.` });
      setSelectedTicketId("");
      setSelectedAgentId("");
      await loadData();
    } catch (err) {
      setNotice({ type: "error", message: err.message });
    } finally {
      setReassigning(false);
    }
  };

  return (
    <div className="support-shell">
      <div className="support-header-bar">
        <div className="support-title-group">
          <h2>Support Administration</h2>
          <p>Manage human support staff accounts, monitor resolution metrics, and assign support tickets.</p>
        </div>
        <div className="support-actions">
          <button className="mini-btn" type="button" onClick={loadData}>
            ↻ Refresh
          </button>
          <button
            className="button-primary"
            type="button"
            onClick={() => setShowCreateModal(true)}
          >
            + Create Support Agent
          </button>
        </div>
      </div>

      {notice && (
        <div className={`notice ${notice.type === "error" ? "error" : "success"}`} role="alert">
          {notice.message}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--line)", paddingBottom: "8px" }}>
        <button
          className={`mini-btn ${activeTab === "overview" ? "button-primary" : ""}`}
          type="button"
          onClick={() => setActiveTab("overview")}
        >
          Performance & Metrics
        </button>
        <button
          className={`mini-btn ${activeTab === "agents" ? "button-primary" : ""}`}
          type="button"
          onClick={() => setActiveTab("agents")}
        >
          Agent Staff ({agents.length})
        </button>
        <button
          className={`mini-btn ${activeTab === "reassign" ? "button-primary" : ""}`}
          type="button"
          onClick={() => setActiveTab("reassign")}
        >
          Ticket Assignment
        </button>
      </div>

      {/* CREATE AGENT MODAL */}
      {showCreateModal && (
        <div className="panel ticket-detail-view" style={{ maxWidth: "600px", margin: "0 auto" }}>
          <div className="panel-heading">
            <div>
              <h3>Add Human Support Agent</h3>
              <p>Create staff credentials and configure granular support permissions.</p>
            </div>
          </div>
          <form onSubmit={handleCreateAgent} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className="support-field">
              <label>Full Name</label>
              <input
                type="text"
                placeholder="Staff Member Name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
            <div className="support-field">
              <label>Kenyan Phone Number</label>
              <input
                type="tel"
                placeholder="0712 345 678"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
              />
            </div>
            <div className="support-field">
              <label>Staff Email</label>
              <input
                type="email"
                placeholder="support@jiranichama.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div className="support-field">
              <label>Initial Login PIN (6-12 digits)</label>
              <input
                type="password"
                placeholder="6 to 12 digits"
                value={pin}
                onChange={e => setPin(e.target.value)}
                minLength={6}
                maxLength={12}
                required
              />
            </div>

            <fieldset style={{ border: "1px solid var(--line)", borderRadius: "8px", padding: "12px" }}>
              <legend style={{ fontSize: "13px", fontWeight: "600" }}>Permissions</legend>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px" }}>
                <label className="support-checkbox-label">
                  <input
                    type="checkbox"
                    checked={permissions.canAssign}
                    onChange={e => setPermissions(p => ({ ...p, canAssign: e.target.checked }))}
                  />
                  Can Self-Assign
                </label>
                <label className="support-checkbox-label">
                  <input
                    type="checkbox"
                    checked={permissions.canReassign}
                    onChange={e => setPermissions(p => ({ ...p, canReassign: e.target.checked }))}
                  />
                  Can Reassign Tickets
                </label>
                <label className="support-checkbox-label">
                  <input
                    type="checkbox"
                    checked={permissions.canChangeStatus}
                    onChange={e => setPermissions(p => ({ ...p, canChangeStatus: e.target.checked }))}
                  />
                  Can Change Status
                </label>
                <label className="support-checkbox-label">
                  <input
                    type="checkbox"
                    checked={permissions.canChangePriority}
                    onChange={e => setPermissions(p => ({ ...p, canChangePriority: e.target.checked }))}
                  />
                  Can Change Priority
                </label>
                <label className="support-checkbox-label">
                  <input
                    type="checkbox"
                    checked={permissions.canAddInternalNotes}
                    onChange={e => setPermissions(p => ({ ...p, canAddInternalNotes: e.target.checked }))}
                  />
                  Can Add Internal Notes
                </label>
                <label className="support-checkbox-label">
                  <input
                    type="checkbox"
                    checked={permissions.canEscalate}
                    onChange={e => setPermissions(p => ({ ...p, canEscalate: e.target.checked }))}
                  />
                  Can Escalate to Admin
                </label>
                <label className="support-checkbox-label">
                  <input
                    type="checkbox"
                    checked={permissions.canClose}
                    onChange={e => setPermissions(p => ({ ...p, canClose: e.target.checked }))}
                  />
                  Can Close Tickets
                </label>
                <label className="support-checkbox-label">
                  <input
                    type="checkbox"
                    checked={permissions.canManageFaq}
                    onChange={e => setPermissions(p => ({ ...p, canManageFaq: e.target.checked }))}
                  />
                  Can Manage FAQs
                </label>
                <label className="support-checkbox-label">
                  <input
                    type="checkbox"
                    checked={permissions.canViewCrossTenant}
                    onChange={e => setPermissions(p => ({ ...p, canViewCrossTenant: e.target.checked }))}
                  />
                  Controlled Cross-Tenant View
                </label>
              </div>
            </fieldset>

            <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
              <button className="button-primary" type="submit" disabled={creatingAgent}>
                {creatingAgent ? "Creating…" : "Save Agent Account"}
              </button>
              <button className="mini-btn" type="button" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* OVERVIEW TAB */}
      {activeTab === "overview" && stats && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="support-stats-grid">
            <div className="support-stat-card">
              <span className="stat-label">Total Support Requests</span>
              <span className="stat-value">{stats.totalTickets || 0}</span>
            </div>
            <div className="support-stat-card">
              <span className="stat-label">Open / In Progress</span>
              <span className="stat-value" style={{ color: "#d9480f" }}>
                {(stats.byStatus?.Open || 0) + (stats.byStatus?.["In Progress"] || 0)}
              </span>
            </div>
            <div className="support-stat-card">
              <span className="stat-label">Escalated Tickets</span>
              <span className="stat-value" style={{ color: "#e03131" }}>
                {stats.escalatedCount || 0}
              </span>
            </div>
            <div className="support-stat-card">
              <span className="stat-label">Resolved / Closed</span>
              <span className="stat-value" style={{ color: "var(--green)" }}>
                {(stats.byStatus?.Resolved || 0) + (stats.byStatus?.Closed || 0)}
              </span>
            </div>
            <div className="support-stat-card">
              <span className="stat-label">Avg Resolution Time</span>
              <span className="stat-value">{stats.avgResolutionHours || 0}h</span>
            </div>
          </div>

          {/* Breakdown cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
            <div className="panel" style={{ padding: "16px" }}>
              <h4 style={{ margin: "0 0 10px" }}>Tickets by Category</h4>
              {Object.entries(stats.byCategory || {}).map(([cat, count]) => (
                <div key={cat} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: "13px" }}>
                  <span>{cat}</span>
                  <strong>{count}</strong>
                </div>
              ))}
            </div>

            <div className="panel" style={{ padding: "16px" }}>
              <h4 style={{ margin: "0 0 10px" }}>Tickets by Priority</h4>
              {Object.entries(stats.byPriority || {}).map(([prio, count]) => (
                <div key={prio} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: "13px" }}>
                  <span>{prio}</span>
                  <strong>{count}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AGENTS MANAGEMENT TAB */}
      {activeTab === "agents" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {agents.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px", color: "var(--muted)" }}>
              No support agents created yet. Click "+ Create Support Agent" to add human staff.
            </div>
          ) : (
            agents.map(agent => (
              <div key={agent.id} className="ticket-detail-view" style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <h4 style={{ margin: "0 0 4px", fontSize: "16px" }}>{agent.name}</h4>
                    <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>
                      Phone: {agent.phone} {agent.email && `• Email: ${agent.email}`} • Active Tickets: <strong>{agent.activeTicketCount}</strong> • Resolved: <strong>{agent.resolvedTicketCount}</strong>
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span className={`support-badge support-badge-${agent.status === "active" ? "resolved" : "closed"}`}>
                      {agent.status}
                    </span>
                    {agent.status === "active" ? (
                      <button
                        className="mini-btn"
                        type="button"
                        style={{ color: "#f08c00", borderColor: "#f08c00" }}
                        onClick={() => handleUpdateAgentStatus(agent.id, "suspended")}
                      >
                        Suspend
                      </button>
                    ) : (
                      <button
                        className="mini-btn"
                        type="button"
                        style={{ color: "var(--green)", borderColor: "var(--green)" }}
                        onClick={() => handleUpdateAgentStatus(agent.id, "active")}
                      >
                        Activate
                      </button>
                    )}
                  </div>
                </div>

                {/* Permissions toggles */}
                <details style={{ marginTop: "10px", fontSize: "12px" }}>
                  <summary style={{ cursor: "pointer", color: "var(--navy)", fontWeight: "600" }}>
                    Configure Permissions ({Object.values(agent.permissions || {}).filter(Boolean).length} enabled)
                  </summary>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "6px", marginTop: "8px" }}>
                    {Object.entries({
                      canAssign: "Self-Assign",
                      canReassign: "Reassign Tickets",
                      canChangeStatus: "Change Status",
                      canChangePriority: "Change Priority",
                      canAddInternalNotes: "Internal Notes",
                      canEscalate: "Escalate",
                      canClose: "Close Tickets",
                      canManageFaq: "Manage FAQs",
                      canViewCrossTenant: "Cross-Tenant Access",
                    }).map(([key, label]) => (
                      <label key={key} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(agent.permissions?.[key])}
                          onChange={() => handleTogglePermission(agent, key)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </details>
              </div>
            ))
          )}
        </div>
      )}

      {/* REASSIGN TICKETS TAB */}
      {activeTab === "reassign" && (
        <div className="panel ticket-detail-view">
          <div className="panel-heading">
            <div>
              <h3>Reassign Support Tickets</h3>
              <p>Manually assign or reassign tickets to balance staff workload.</p>
            </div>
          </div>
          <form onSubmit={handleReassignTicket} style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "500px" }}>
            <div className="support-field">
              <label>Select Ticket</label>
              <select
                value={selectedTicketId}
                onChange={e => setSelectedTicketId(e.target.value)}
                required
              >
                <option value="">-- Choose Ticket --</option>
                {tickets.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.ticketNumber} — {t.subject.slice(0, 40)} [{t.status}] (Current: {t.assignedAgentName || "Unassigned"})
                  </option>
                ))}
              </select>
            </div>

            <div className="support-field">
              <label>Assign to Support Agent</label>
              <select
                value={selectedAgentId}
                onChange={e => setSelectedAgentId(e.target.value)}
                required
              >
                <option value="">-- Choose Agent --</option>
                {agents.filter(a => a.status === "active").map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.activeTicketCount} active tickets)
                  </option>
                ))}
              </select>
            </div>

            <button className="button-primary" type="submit" disabled={reassigning || !selectedTicketId || !selectedAgentId}>
              {reassigning ? "Assigning…" : "Confirm Ticket Assignment"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
