import React, { useState, useEffect } from "react";

const STATUSES = ["Open", "In Progress", "Waiting for User", "Resolved", "Closed"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];

export default function SupportAgentPanel() {
  const [tickets, setTickets] = useState([]);
  const [workload, setWorkload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [assignedOnly, setAssignedOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [notice, setNotice] = useState(null);

  // Message & note input
  const [replyMessage, setReplyMessage] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [replyAttachments, setReplyAttachments] = useState([]);
  const [submittingReply, setSubmittingReply] = useState(false);

  // Escalation modal
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [escalationReason, setEscalationReason] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [ticketsRes, workloadRes] = await Promise.all([
        fetch("/api/support/tickets", { headers: { Accept: "application/json" } }),
        fetch("/api/support/agent/workload", { headers: { Accept: "application/json" } })
      ]);

      if (ticketsRes.ok) {
        const ticketData = await ticketsRes.json();
        setTickets(ticketData.data || []);
      }
      if (workloadRes.ok) {
        const workloadData = await workloadRes.json();
        setWorkload(workloadData.data);
      }
    } catch (err) {
      console.error("Failed to load support agent data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStatusChange = async (newStatus) => {
    if (!selectedTicket || !newStatus) return;
    try {
      const res = await fetch(`/api/support/tickets/${selectedTicket.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "chama",
          Accept: "application/json"
        },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update status");
      setSelectedTicket(data.data);
      setTickets(prev => prev.map(t => t.id === data.data.id ? data.data : t));
      setNotice({ type: "success", message: `Ticket status set to ${newStatus}.` });
    } catch (err) {
      setNotice({ type: "error", message: err.message });
    }
  };

  const handlePriorityChange = async (newPriority) => {
    if (!selectedTicket || !newPriority) return;
    try {
      const res = await fetch(`/api/support/tickets/${selectedTicket.id}/priority`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "chama",
          Accept: "application/json"
        },
        body: JSON.stringify({ priority: newPriority })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update priority");
      setSelectedTicket(data.data);
      setTickets(prev => prev.map(t => t.id === data.data.id ? data.data : t));
      setNotice({ type: "success", message: `Ticket priority set to ${newPriority}.` });
    } catch (err) {
      setNotice({ type: "error", message: err.message });
    }
  };

  const handleAssignToMe = async () => {
    if (!selectedTicket) return;
    try {
      const res = await fetch(`/api/support/tickets/${selectedTicket.id}/assign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "chama",
          Accept: "application/json"
        },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to assign ticket");
      setSelectedTicket(data.data);
      setTickets(prev => prev.map(t => t.id === data.data.id ? data.data : t));
      setNotice({ type: "success", message: "Ticket assigned to you." });
      // reload workload
      const wRes = await fetch("/api/support/agent/workload", { headers: { Accept: "application/json" } });
      if (wRes.ok) setWorkload((await wRes.json()).data);
    } catch (err) {
      setNotice({ type: "error", message: err.message });
    }
  };

  const handleEscalate = async () => {
    if (!selectedTicket || !escalationReason.trim()) return;
    try {
      const res = await fetch(`/api/support/tickets/${selectedTicket.id}/escalate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "chama",
          Accept: "application/json"
        },
        body: JSON.stringify({ reason: escalationReason.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to escalate ticket");
      setSelectedTicket(data.data);
      setTickets(prev => prev.map(t => t.id === data.data.id ? data.data : t));
      setShowEscalateModal(false);
      setEscalationReason("");
      setNotice({ type: "success", message: "Ticket escalated to platform administrator." });
    } catch (err) {
      setNotice({ type: "error", message: err.message });
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      if (file.size > 5 * 1024 * 1024) {
        setNotice({ type: "error", message: `File ${file.name} exceeds 5MB limit.` });
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Data = event.target.result.split(",")[1];
        setReplyAttachments(prev => [
          ...prev,
          {
            originalName: file.name,
            mimeType: file.type || "application/octet-stream",
            data: base64Data,
            size: file.size
          }
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const handleSendResponse = async (e) => {
    e.preventDefault();
    if (!replyMessage.trim() || !selectedTicket) return;

    setSubmittingReply(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/support/tickets/${selectedTicket.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "chama",
          Accept: "application/json"
        },
        body: JSON.stringify({
          message: replyMessage.trim(),
          isInternalNote,
          attachments: replyAttachments
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to post message");

      setReplyMessage("");
      setIsInternalNote(false);
      setReplyAttachments([]);
      setSelectedTicket(data.data);
      setTickets(prev => prev.map(t => t.id === data.data.id ? data.data : t));
      setNotice({
        type: "success",
        message: isInternalNote ? "Private internal note saved." : "Response sent to user."
      });
    } catch (err) {
      setNotice({ type: "error", message: err.message });
    } finally {
      setSubmittingReply(false);
    }
  };

  const filteredTickets = tickets.filter(t => {
    if (assignedOnly && workload && t.assignedAgentId !== workload.agentId) return false;
    if (statusFilter !== "All" && t.status !== statusFilter) return false;
    if (priorityFilter !== "All" && t.priority !== priorityFilter) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      const matchNum = t.ticketNumber?.toLowerCase().includes(term);
      const matchSubject = t.subject?.toLowerCase().includes(term);
      const matchUser = t.userName?.toLowerCase().includes(term);
      const matchCat = t.category?.toLowerCase().includes(term);
      if (!matchNum && !matchSubject && !matchUser && !matchCat) return false;
    }
    return true;
  });

  const getStatusBadge = (status) => {
    const key = (status || "").toLowerCase().replace(/\s+/g, "");
    return <span className={`support-badge support-badge-${key}`}>{status}</span>;
  };

  return (
    <div className="support-shell">
      <div className="support-header-bar">
        <div className="support-title-group">
          <h2>Support Agent Portal</h2>
          <p>Triage tickets, respond to chama members, collaborate with internal notes, and manage ticket lifecycle.</p>
        </div>
        <div className="support-actions">
          {selectedTicket && (
            <button className="mini-btn" type="button" onClick={() => setSelectedTicket(null)}>
              ← Back to Ticket Queue
            </button>
          )}
          <button className="mini-btn" type="button" onClick={loadData}>
            ↻ Refresh Queue
          </button>
        </div>
      </div>

      {notice && (
        <div className={`notice ${notice.type === "error" ? "error" : "success"}`} role="alert">
          {notice.message}
        </div>
      )}

      {/* AGENT WORKLOAD STATS */}
      {workload && !selectedTicket && (
        <div className="support-stats-grid">
          <div className="support-stat-card">
            <span className="stat-label">Assigned to Me</span>
            <span className="stat-value">{workload.totalAssigned || 0}</span>
          </div>
          <div className="support-stat-card">
            <span className="stat-label">Open / In Progress</span>
            <span className="stat-value" style={{ color: "#d9480f" }}>{workload.openCount || 0}</span>
          </div>
          <div className="support-stat-card">
            <span className="stat-label">Waiting for User</span>
            <span className="stat-value" style={{ color: "#6741d9" }}>{workload.waitingCount || 0}</span>
          </div>
          <div className="support-stat-card">
            <span className="stat-label">Resolved / Closed</span>
            <span className="stat-value" style={{ color: "var(--green)" }}>{(workload.resolvedCount || 0) + (workload.closedCount || 0)}</span>
          </div>
          <div className="support-stat-card">
            <span className="stat-label">Avg Resolution</span>
            <span className="stat-value">{workload.avgResolutionHours || 0}h</span>
          </div>
        </div>
      )}

      {/* TICKET DETAILS & WORKSPACE */}
      {selectedTicket ? (
        <div className="ticket-detail-view">
          <div className="ticket-detail-top">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                <span style={{ fontWeight: "700", color: "var(--navy)", fontSize: "16px" }}>
                  {selectedTicket.ticketNumber}
                </span>
                {getStatusBadge(selectedTicket.status)}
                <span className={`priority-badge priority-${(selectedTicket.priority || "medium").toLowerCase()}`}>
                  {selectedTicket.priority} Priority
                </span>
                {selectedTicket.escalated && (
                  <span style={{ background: "#ffe3e3", color: "#e03131", fontSize: "11px", fontWeight: "700", padding: "2px 8px", borderRadius: "4px" }}>
                    ⚠️ ESCALATED
                  </span>
                )}
              </div>
              <h3 style={{ margin: "0 0 4px", fontSize: "18px" }}>{selectedTicket.subject}</h3>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>
                User: <strong>{selectedTicket.userName}</strong> ({selectedTicket.userPhone}) • Category: <strong>{selectedTicket.category}</strong>
                {selectedTicket.assignedAgentName && ` • Assigned: ${selectedTicket.assignedAgentName}`}
              </p>
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {(!selectedTicket.assignedAgentId || (workload && selectedTicket.assignedAgentId !== workload.agentId)) && (
                <button
                  className="mini-btn"
                  type="button"
                  style={{ borderColor: "var(--green)", color: "var(--green)" }}
                  onClick={handleAssignToMe}
                >
                  👤 Assign to Me
                </button>
              )}
              {!selectedTicket.escalated && (
                <button
                  className="mini-btn"
                  type="button"
                  style={{ borderColor: "#e03131", color: "#e03131" }}
                  onClick={() => setShowEscalateModal(true)}
                >
                  ⚡ Escalate to Admin
                </button>
              )}
            </div>
          </div>

          {/* Ticket Control Bar for Agent */}
          <div className="ticket-control-bar">
            <label>
              Status:
              <select
                value={selectedTicket.status}
                onChange={e => handleStatusChange(e.target.value)}
              >
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>

            <label>
              Priority:
              <select
                value={selectedTicket.priority}
                onChange={e => handlePriorityChange(e.target.value)}
              >
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          </div>

          {/* Escalation Modal */}
          {showEscalateModal && (
            <div style={{ background: "#fff5f5", border: "1px solid #ffc9c9", borderRadius: "8px", padding: "14px" }}>
              <h4 style={{ margin: "0 0 6px", color: "#c92a2a" }}>Escalate to Platform Administrator</h4>
              <p style={{ margin: "0 0 8px", fontSize: "13px", color: "#495057" }}>
                Provide a reason why this ticket requires higher-level administrator review.
              </p>
              <textarea
                rows={2}
                placeholder="Escalation reason..."
                value={escalationReason}
                onChange={e => setEscalationReason(e.target.value)}
                style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--line)", marginBottom: "8px" }}
              />
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className="button-primary"
                  type="button"
                  style={{ background: "#e03131", borderColor: "#c92a2a" }}
                  onClick={handleEscalate}
                >
                  Confirm Escalation
                </button>
                <button className="mini-btn" type="button" onClick={() => setShowEscalateModal(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Conversation Thread */}
          <div className="support-conversation-thread">
            {selectedTicket.messages?.map((msg) => {
              const isStaff = msg.isStaff;
              const isNote = msg.isInternalNote;
              return (
                <div
                  key={msg.id}
                  className={`support-msg-card ${isNote ? "support-msg-note" : isStaff ? "support-msg-staff" : "support-msg-user"}`}
                >
                  <div className="support-msg-header">
                    <span className="support-msg-sender">
                      {isNote ? "🔒 " : isStaff ? "🎧 " : "👤 "}
                      {msg.senderName} ({msg.senderRole})
                      {isNote && <span className="internal-note-tag">Private Internal Note</span>}
                    </span>
                    <span style={{ color: "var(--muted)" }}>
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} • {new Date(msg.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="support-msg-body">{msg.message}</div>
                  {msg.attachments?.length > 0 && (
                    <div className="support-attachments-list">
                      {msg.attachments.map(att => (
                        <a
                          key={att.id}
                          className="support-att-chip"
                          href={`/api/support/tickets/${selectedTicket.id}/attachments/${att.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          📎 {att.originalName} ({Math.round(att.size / 1024)} KB)
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Response / Internal Note Composer */}
          <form onSubmit={handleSendResponse} className="support-composer">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label htmlFor="agent-response-text" style={{ fontSize: "13px", fontWeight: "600" }}>
                {isInternalNote ? "Add Private Internal Note (Staff Only):" : "Reply to User:"}
              </label>
              <label className="support-checkbox-label">
                <input
                  type="checkbox"
                  checked={isInternalNote}
                  onChange={e => setIsInternalNote(e.target.checked)}
                />
                🔒 Private Internal Note (Hidden from user)
              </label>
            </div>

            <textarea
              id="agent-response-text"
              rows={3}
              placeholder={isInternalNote ? "Write an internal note for other agents and admins (never sent to user)..." : "Write a clear, helpful response to the user..."}
              value={replyMessage}
              onChange={e => setReplyMessage(e.target.value)}
              style={isInternalNote ? { background: "#fffdf0", borderColor: "#ffe066" } : {}}
              required
            />

            <div className="support-composer-options">
              <div>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.txt"
                  onChange={handleFileChange}
                  style={{ fontSize: "12px" }}
                />
                {replyAttachments.length > 0 && (
                  <div className="support-attachments-list">
                    {replyAttachments.map((att, idx) => (
                      <span key={idx} className="support-att-chip">
                        📎 {att.originalName}
                        <button
                          type="button"
                          style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--red)" }}
                          onClick={() => setReplyAttachments(prev => prev.filter((_, i) => i !== idx))}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                className="button-primary"
                type="submit"
                disabled={submittingReply}
                style={isInternalNote ? { background: "#f59f00", borderColor: "#e67700" } : {}}
              >
                {submittingReply ? "Saving…" : isInternalNote ? "Save Internal Note" : "Send Reply to User"}
              </button>
            </div>
          </form>

          {/* Audit / Timeline Drawer */}
          {selectedTicket.history?.length > 0 && (
            <details style={{ marginTop: "10px", fontSize: "13px", color: "var(--muted)" }}>
              <summary style={{ cursor: "pointer", fontWeight: "600" }}>
                Ticket Lifecycle History ({selectedTicket.history.length} events)
              </summary>
              <ul style={{ margin: "8px 0 0", paddingLeft: "20px" }}>
                {selectedTicket.history.map(item => (
                  <li key={item.id} style={{ marginBottom: "4px" }}>
                    <strong>{item.action}</strong> by {item.by?.name} ({item.by?.role}) at {new Date(item.at).toLocaleString()}
                    {item.details?.oldStatus && ` [${item.details.oldStatus} → ${item.details.newStatus}]`}
                    {item.details?.reason && ` — "${item.details.reason}"`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ) : (
        /* TICKET QUEUE LIST & FILTERS */
        <div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "14px" }}>
            <input
              type="text"
              placeholder="Search by ticket #, subject, or member..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ flex: "1 1 200px", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--line)" }}
            />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ padding: "8px", borderRadius: "6px", border: "1px solid var(--line)" }}
            >
              <option value="All">All Statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              style={{ padding: "8px", borderRadius: "6px", border: "1px solid var(--line)" }}
            >
              <option value="All">All Priorities</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={assignedOnly}
                onChange={e => setAssignedOnly(e.target.checked)}
              />
              Assigned to Me Only
            </label>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "24px", color: "var(--muted)" }}>Loading support queue…</div>
          ) : filteredTickets.length === 0 ? (
            <div style={{ textAlign: "center", padding: "36px 16px", background: "var(--paper)", borderRadius: "10px", border: "1px solid var(--line)" }}>
              <p style={{ fontSize: "16px", fontWeight: "600", margin: "0 0 6px" }}>No tickets match current filters</p>
              <p style={{ color: "var(--muted)", margin: 0, fontSize: "14px" }}>
                All support requests in this queue have been handled or none match your selected criteria.
              </p>
            </div>
          ) : (
            <div className="ticket-list">
              {filteredTickets.map(ticket => (
                <div
                  key={ticket.id}
                  className="ticket-item-card"
                  onClick={() => setSelectedTicket(ticket)}
                >
                  <div className="ticket-card-header">
                    <div className="ticket-num-cat">
                      <span>{ticket.ticketNumber}</span>
                      <span>•</span>
                      <span>{ticket.category}</span>
                      {ticket.escalated && (
                        <span style={{ color: "#e03131", fontWeight: "700", fontSize: "11px" }}>[ESCALATED]</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      {getStatusBadge(ticket.status)}
                      <span className={`priority-badge priority-${(ticket.priority || "medium").toLowerCase()}`}>
                        {ticket.priority}
                      </span>
                    </div>
                  </div>
                  <h4 className="ticket-card-title">{ticket.subject}</h4>
                  <div className="ticket-card-meta">
                    <span>User: <strong>{ticket.userName}</strong></span>
                    <span>Updated: {new Date(ticket.updatedAt).toLocaleDateString()}</span>
                    <span>Messages: {ticket.messages?.length || 1}</span>
                    <span>Assigned: <strong>{ticket.assignedAgentName || "Unassigned"}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
