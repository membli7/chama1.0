import React, { useState, useEffect } from "react";

const CATEGORIES = [
  "Account & Login",
  "Contributions & Fines",
  "Loans & Approvals",
  "Attendance & Meetings",
  "Technical Issue",
  "Other"
];

export default function SupportPanel() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showNewTicketForm, setShowNewTicketForm] = useState(false);
  const [notice, setNotice] = useState(null);

  // New ticket state
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Reply state
  const [replyText, setReplyText] = useState("");
  const [replyAttachments, setReplyAttachments] = useState([]);
  const [replying, setReplying] = useState(false);

  // Reopen state
  const [reopenReason, setReopenReason] = useState("");
  const [showReopenModal, setShowReopenModal] = useState(false);

  // Listen for open-support-ticket custom events from FAQ "Still need help?"
  useEffect(() => {
    const handleOpenSupport = (e) => {
      setShowNewTicketForm(true);
      setSelectedTicket(null);
      if (e.detail?.category && CATEGORIES.includes(e.detail.category)) {
        setCategory(e.detail.category);
      }
      if (e.detail?.subject) {
        setSubject(`Help with: ${e.detail.subject}`);
      }
    };
    window.addEventListener("chama:open-support-ticket", handleOpenSupport);
    return () => window.removeEventListener("chama:open-support-ticket", handleOpenSupport);
  }, []);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/support/tickets", {
        headers: { Accept: "application/json" }
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(data.data || []);
      }
    } catch (err) {
      console.error("Failed to load tickets", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const handleFileChange = (e, targetSetter) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    files.forEach(file => {
      if (file.size > 5 * 1024 * 1024) {
        setNotice({ type: "error", message: `File ${file.name} exceeds 5MB limit.` });
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Data = event.target.result.split(",")[1];
        targetSetter(prev => [
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

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;

    setSubmitting(true);
    setNotice(null);
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "chama",
          Accept: "application/json"
        },
        body: JSON.stringify({
          category,
          subject: subject.trim(),
          description: description.trim(),
          attachments
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Could not submit ticket.");
      }
      setNotice({ type: "success", message: "Your support request has been submitted to our support team." });
      setSubject("");
      setDescription("");
      setAttachments([]);
      setShowNewTicketForm(false);
      await loadTickets();
      if (data.ticket) {
        setSelectedTicket(data.ticket);
      }
    } catch (err) {
      setNotice({ type: "error", message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket) return;

    setReplying(true);
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
          message: replyText.trim(),
          attachments: replyAttachments
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Could not send message.");
      }
      setReplyText("");
      setReplyAttachments([]);
      setSelectedTicket(data.data);
      // update list
      setTickets(prev => prev.map(t => t.id === data.data.id ? data.data : t));
    } catch (err) {
      setNotice({ type: "error", message: err.message });
    } finally {
      setReplying(false);
    }
  };

  const handleReopenTicket = async () => {
    if (!selectedTicket) return;
    setNotice(null);
    try {
      const res = await fetch(`/api/support/tickets/${selectedTicket.id}/reopen`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "chama",
          Accept: "application/json"
        },
        body: JSON.stringify({
          reason: reopenReason.trim() || "User requested to reopen this ticket."
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Could not reopen ticket.");
      }
      setNotice({ type: "success", message: "Support ticket reopened." });
      setShowReopenModal(false);
      setReopenReason("");
      setSelectedTicket(data.data);
      await loadTickets();
    } catch (err) {
      setNotice({ type: "error", message: err.message });
    }
  };

  const getStatusBadge = (status) => {
    const key = (status || "").toLowerCase().replace(/\s+/g, "");
    return <span className={`support-badge support-badge-${key}`}>{status}</span>;
  };

  return (
    <div className="support-shell">
      <div className="support-header-bar">
        <div className="support-title-group">
          <h2>Member Support</h2>
          <p>Connect with a designated human support agent to assist with your chama account.</p>
        </div>
        <div className="support-actions">
          {!showNewTicketForm && (
            <button
              className="button-primary"
              type="button"
              onClick={() => { setShowNewTicketForm(true); setSelectedTicket(null); }}
            >
              + Submit Support Request
            </button>
          )}
          {showNewTicketForm && (
            <button
              className="mini-btn"
              type="button"
              onClick={() => setShowNewTicketForm(false)}
            >
              ← Back to My Tickets
            </button>
          )}
          {selectedTicket && (
            <button
              className="mini-btn"
              type="button"
              onClick={() => setSelectedTicket(null)}
            >
              ← All Tickets
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className={`notice ${notice.type === "error" ? "error" : "success"}`} role="alert">
          {notice.message}
        </div>
      )}

      {/* NEW TICKET FORM */}
      {showNewTicketForm && (
        <div className="panel ticket-detail-view">
          <div className="panel-heading">
            <div>
              <h3>Create Support Request</h3>
              <p>Our human support staff will review your request and get back to you.</p>
            </div>
          </div>
          <form onSubmit={handleCreateTicket} className="support-shell" style={{ gap: "14px" }}>
            <div className="support-field">
              <label htmlFor="ticket-category">Problem Category</label>
              <select
                id="ticket-category"
                value={category}
                onChange={e => setCategory(e.target.value)}
                required
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="support-field">
              <label htmlFor="ticket-subject">Subject</label>
              <input
                id="ticket-subject"
                type="text"
                placeholder="Brief summary of your question or issue"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                maxLength={150}
                required
              />
            </div>

            <div className="support-field">
              <label htmlFor="ticket-description">Detailed Description</label>
              <textarea
                id="ticket-description"
                rows={5}
                placeholder="Please describe what happened, what you expected, and any details that can help our human staff assist you..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                maxLength={5000}
                required
              />
            </div>

            <div className="support-field">
              <label>Attachments or Screenshots (Optional, max 5MB each)</label>
              <input
                type="file"
                multiple
                accept="image/*,.pdf,.txt"
                onChange={e => handleFileChange(e, setAttachments)}
              />
              {attachments.length > 0 && (
                <div className="support-attachments-list">
                  {attachments.map((att, idx) => (
                    <span key={idx} className="support-att-chip">
                      📎 {att.originalName} ({Math.round(att.size / 1024)} KB)
                      <button
                        type="button"
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--red)" }}
                        onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
              <button className="button-primary" type="submit" disabled={submitting}>
                {submitting ? "Submitting Request…" : "Submit Request"}
              </button>
              <button
                className="mini-btn"
                type="button"
                onClick={() => { setShowNewTicketForm(false); }}
                disabled={submitting}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TICKET DETAIL & CONVERSATION VIEW */}
      {!showNewTicketForm && selectedTicket && (
        <div className="ticket-detail-view">
          <div className="ticket-detail-top">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                <span style={{ fontWeight: "700", color: "var(--navy)", fontSize: "15px" }}>
                  {selectedTicket.ticketNumber}
                </span>
                {getStatusBadge(selectedTicket.status)}
                <span className={`priority-badge priority-${(selectedTicket.priority || "medium").toLowerCase()}`}>
                  {selectedTicket.priority} Priority
                </span>
              </div>
              <h3 style={{ margin: "0 0 6px", fontSize: "18px" }}>{selectedTicket.subject}</h3>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>
                Category: <strong>{selectedTicket.category}</strong> • Submitted: {new Date(selectedTicket.createdAt).toLocaleString()}
                {selectedTicket.assignedAgentName && ` • Assigned to: ${selectedTicket.assignedAgentName}`}
              </p>
            </div>
            <div>
              {["Resolved", "Closed"].includes(selectedTicket.status) && (
                <button
                  className="mini-btn"
                  type="button"
                  style={{ borderColor: "var(--green)", color: "var(--green)" }}
                  onClick={() => setShowReopenModal(true)}
                >
                  ↺ Reopen Ticket
                </button>
              )}
            </div>
          </div>

          {/* Reopen Modal */}
          {showReopenModal && (
            <div style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "8px", padding: "14px" }}>
              <h4 style={{ margin: "0 0 6px" }}>Reopen this Support Ticket</h4>
              <p style={{ margin: "0 0 10px", fontSize: "13px", color: "var(--muted)" }}>
                Please let us know why you need further assistance on this issue.
              </p>
              <textarea
                rows={2}
                placeholder="Reason for reopening..."
                value={reopenReason}
                onChange={e => setReopenReason(e.target.value)}
                style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--line)", marginBottom: "8px" }}
              />
              <div style={{ display: "flex", gap: "8px" }}>
                <button className="button-primary" type="button" onClick={handleReopenTicket}>
                  Confirm Reopen
                </button>
                <button className="mini-btn" type="button" onClick={() => setShowReopenModal(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Conversation Thread */}
          <div className="support-conversation-thread">
            {selectedTicket.messages?.map((msg) => {
              const isStaff = msg.isStaff;
              return (
                <div
                  key={msg.id}
                  className={`support-msg-card ${isStaff ? "support-msg-staff" : "support-msg-user"}`}
                >
                  <div className="support-msg-header">
                    <span className="support-msg-sender">
                      {isStaff ? "🎧 " : "👤 "}
                      {msg.senderName} {isStaff ? "(Support Agent)" : "(You)"}
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

          {/* Reply Composer */}
          {selectedTicket.status !== "Closed" ? (
            <form onSubmit={handleSendReply} className="support-composer">
              <label htmlFor="ticket-reply-text" style={{ fontSize: "13px", fontWeight: "600" }}>
                Add your response:
              </label>
              <textarea
                id="ticket-reply-text"
                rows={3}
                placeholder="Type your message to the support agent..."
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                required
              />
              <div className="support-composer-options">
                <div>
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf,.txt"
                    onChange={e => handleFileChange(e, setReplyAttachments)}
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
                <button className="button-primary" type="submit" disabled={replying}>
                  {replying ? "Sending…" : "Send Message"}
                </button>
              </div>
            </form>
          ) : (
            <div style={{ textAlign: "center", padding: "12px", background: "var(--bg)", borderRadius: "8px", color: "var(--muted)", fontSize: "13px" }}>
              This support ticket has been closed. If you still need help, you can reopen it above or create a new ticket.
            </div>
          )}
        </div>
      )}

      {/* TICKETS LIST VIEW */}
      {!showNewTicketForm && !selectedTicket && (
        <div>
          {loading ? (
            <div style={{ textAlign: "center", padding: "24px", color: "var(--muted)" }}>Loading support tickets…</div>
          ) : tickets.length === 0 ? (
            <div style={{ textAlign: "center", padding: "36px 16px", background: "var(--paper)", borderRadius: "10px", border: "1px solid var(--line)" }}>
              <p style={{ fontSize: "16px", fontWeight: "600", margin: "0 0 6px" }}>You have no open support tickets</p>
              <p style={{ color: "var(--muted)", margin: "0 0 16px", fontSize: "14px" }}>
                When you encounter any problem or need assistance, submit a ticket to communicate with our human support team.
              </p>
              <button className="button-primary" type="button" onClick={() => setShowNewTicketForm(true)}>
                + Submit a Support Request
              </button>
            </div>
          ) : (
            <div className="ticket-list">
              {tickets.map(ticket => (
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
                    <span>Submitted: {new Date(ticket.createdAt).toLocaleDateString()}</span>
                    <span>Messages: {ticket.messages?.length || 1}</span>
                    {ticket.assignedAgentName && <span>Agent: {ticket.assignedAgentName}</span>}
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
