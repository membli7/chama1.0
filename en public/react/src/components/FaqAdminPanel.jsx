import React, { useState, useEffect } from "react";

export default function FaqAdminPanel() {
  const [faqs, setFaqs] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all"); // "all" | "negative" | "insights"
  const [notice, setNotice] = useState(null);

  // Create / Edit modal state
  const [showModal, setShowModal] = useState(false);
  const [editingFaq, setEditingFaq] = useState(null);
  const [category, setCategory] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [published, setPublished] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [faqsRes, metricsRes] = await Promise.all([
        fetch("/api/faqs?all=true", { headers: { Accept: "application/json" } }),
        fetch("/api/faqs/admin/metrics", { headers: { Accept: "application/json" } }),
      ]);

      if (faqsRes.ok) setFaqs((await faqsRes.json()).data || []);
      if (metricsRes.ok) setMetrics((await metricsRes.json()).data);
    } catch (err) {
      console.error("Failed to load FAQ admin data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = (prefill = {}) => {
    setEditingFaq(null);
    setCategory(prefill.category || "General");
    setQuestion(prefill.question || "");
    setAnswer(prefill.answer || "");
    setPublished(true);
    setShowModal(true);
  };

  const openEditModal = (faq) => {
    setEditingFaq(faq);
    setCategory(faq.category || "");
    setQuestion(faq.question || "");
    setAnswer(faq.answer || "");
    setPublished(faq.published !== false);
    setShowModal(true);
  };

  const handleSaveFaq = async (e) => {
    e.preventDefault();
    if (!category.trim() || !question.trim() || !answer.trim()) return;

    setSaving(true);
    setNotice(null);
    const url = editingFaq ? `/api/faqs/${editingFaq.id}` : "/api/faqs";
    const method = editingFaq ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "chama",
          Accept: "application/json",
        },
        body: JSON.stringify({
          category: category.trim(),
          question: question.trim(),
          answer: answer.trim(),
          published,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save FAQ");

      setNotice({ type: "success", message: editingFaq ? "FAQ updated." : "FAQ created." });
      setShowModal(false);
      await loadData();
    } catch (err) {
      setNotice({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFaq = async (id) => {
    if (!window.confirm("Are you sure you want to delete this FAQ article?")) return;
    setNotice(null);
    try {
      const res = await fetch(`/api/faqs/${id}`, {
        method: "DELETE",
        headers: {
          "X-Requested-With": "chama",
          Accept: "application/json",
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to delete FAQ");

      setNotice({ type: "success", message: "FAQ article deleted." });
      setFaqs(prev => prev.filter(f => f.id !== id));
      await loadData();
    } catch (err) {
      setNotice({ type: "error", message: err.message });
    }
  };

  const handleTogglePublished = async (faq) => {
    try {
      const res = await fetch(`/api/faqs/${faq.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "chama",
          Accept: "application/json",
        },
        body: JSON.stringify({ published: !faq.published }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update publish status");

      setFaqs(prev => prev.map(f => f.id === faq.id ? { ...f, published: !f.published } : f));
      setNotice({ type: "success", message: `FAQ is now ${!faq.published ? "published" : "draft"}.` });
    } catch (err) {
      setNotice({ type: "error", message: err.message });
    }
  };

  const negativeFaqs = metrics?.negativeFeedbackFaqs || [];

  return (
    <div className="support-shell">
      <div className="support-header-bar">
        <div className="support-title-group">
          <h2>FAQ Knowledge Base Management</h2>
          <p>Author and maintain human-written FAQ guides, review feedback, and address frequently asked topics.</p>
        </div>
        <div className="support-actions">
          <button className="mini-btn" type="button" onClick={loadData}>
            ↻ Refresh
          </button>
          <button className="button-primary" type="button" onClick={() => openCreateModal()}>
            + Create New FAQ
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
          className={`mini-btn ${activeTab === "all" ? "button-primary" : ""}`}
          type="button"
          onClick={() => setActiveTab("all")}
        >
          All FAQs ({faqs.length})
        </button>
        <button
          className={`mini-btn ${activeTab === "negative" ? "button-primary" : ""}`}
          type="button"
          onClick={() => setActiveTab("negative")}
          style={negativeFaqs.length > 0 ? { borderColor: "#f08c00" } : {}}
        >
          Negative Feedback Alerts ({negativeFaqs.length})
        </button>
        <button
          className={`mini-btn ${activeTab === "insights" ? "button-primary" : ""}`}
          type="button"
          onClick={() => setActiveTab("insights")}
        >
          Frequently Asked Support Topics
        </button>
      </div>

      {/* CREATE / EDIT MODAL */}
      {showModal && (
        <div className="panel ticket-detail-view" style={{ maxWidth: "680px", margin: "0 auto" }}>
          <div className="panel-heading">
            <div>
              <h3>{editingFaq ? "Edit FAQ Article" : "Create New FAQ Article"}</h3>
              <p>Write step-by-step instructions for members and administrators.</p>
            </div>
          </div>
          <form onSubmit={handleSaveFaq} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className="support-field">
              <label>Category</label>
              <input
                type="text"
                placeholder="e.g. Account & Login, Contributions, Loans..."
                value={category}
                onChange={e => setCategory(e.target.value)}
                required
              />
            </div>
            <div className="support-field">
              <label>Question</label>
              <input
                type="text"
                placeholder="e.g. How do I change my PIN?"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                required
              />
            </div>
            <div className="support-field">
              <label>Step-by-step Answer</label>
              <textarea
                rows={6}
                placeholder="Write clear, numbered instructions (1., 2., 3.)..."
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                required
              />
            </div>
            <label className="support-checkbox-label">
              <input
                type="checkbox"
                checked={published}
                onChange={e => setPublished(e.target.checked)}
              />
              Publish immediately (visible to all users)
            </label>

            <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
              <button className="button-primary" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save FAQ"}
              </button>
              <button className="mini-btn" type="button" onClick={() => setShowModal(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ALL FAQS TAB */}
      {activeTab === "all" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "24px", color: "var(--muted)" }}>Loading FAQs…</div>
          ) : faqs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px", color: "var(--muted)" }}>No FAQs created yet.</div>
          ) : (
            faqs.map(faq => (
              <div key={faq.id} className="ticket-detail-view" style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px", flexWrap: "wrap" }}>
                  <div>
                    <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--navy)", textTransform: "uppercase" }}>
                      {faq.category}
                    </span>
                    <h4 style={{ margin: "4px 0", fontSize: "16px" }}>{faq.question}</h4>
                  </div>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <span className={`support-badge support-badge-${faq.published !== false ? "resolved" : "closed"}`}>
                      {faq.published !== false ? "Published" : "Draft"}
                    </span>
                    <button
                      className="mini-btn"
                      type="button"
                      onClick={() => handleTogglePublished(faq)}
                    >
                      {faq.published !== false ? "Unpublish" : "Publish"}
                    </button>
                    <button
                      className="mini-btn"
                      type="button"
                      onClick={() => openEditModal(faq)}
                    >
                      Edit
                    </button>
                    <button
                      className="mini-btn"
                      type="button"
                      style={{ color: "var(--red)", borderColor: "var(--red)" }}
                      onClick={() => handleDeleteFaq(faq.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: "13px", color: "#334e40", margin: "8px 0", whiteSpace: "pre-wrap" }}>
                  {faq.answer.slice(0, 180)}...
                </div>

                <div style={{ fontSize: "12px", color: "var(--muted)", display: "flex", gap: "14px" }}>
                  <span>👍 Helpful: <strong>{faq.helpfulCount || 0}</strong></span>
                  <span>👎 Not Helpful: <strong>{faq.notHelpfulCount || 0}</strong></span>
                  <span>Updated: {new Date(faq.updatedAt || faq.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* NEGATIVE FEEDBACK ALERTS TAB */}
      {activeTab === "negative" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {negativeFaqs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px", color: "var(--green)", background: "var(--paper)", borderRadius: "8px" }}>
              ✓ No FAQs are currently receiving excessive negative feedback.
            </div>
          ) : (
            negativeFaqs.map(faq => (
              <div key={faq.id} className="ticket-detail-view" style={{ borderColor: "#ffa8a8", background: "#fff5f5" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                  <div>
                    <span style={{ color: "#c92a2a", fontWeight: "700", fontSize: "12px" }}>⚠️ NEEDS REVIEW</span>
                    <h4 style={{ margin: "4px 0", fontSize: "16px" }}>{faq.question}</h4>
                    <p style={{ margin: "4px 0", fontSize: "13px", color: "#495057" }}>Category: {faq.category}</p>
                  </div>
                  <button className="button-primary" type="button" onClick={() => openEditModal(faq)}>
                    Edit & Improve Answer
                  </button>
                </div>
                <div style={{ fontSize: "13px", margin: "8px 0", whiteSpace: "pre-wrap" }}>{faq.answer}</div>
                <div style={{ fontSize: "12px", color: "#c92a2a" }}>
                  Received {faq.notHelpfulCount} "Not Helpful" votes vs {faq.helpfulCount} "Helpful" votes.
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* INSIGHTS & FREQUENTLY ASKED TOPICS TAB */}
      {activeTab === "insights" && (
        <div className="panel" style={{ padding: "16px" }}>
          <h4 style={{ margin: "0 0 8px" }}>Support Ticket Topic Distribution</h4>
          <p style={{ fontSize: "13px", color: "var(--muted)", margin: "0 0 16px" }}>
            Review frequently submitted support ticket categories to identify topics that need new or better FAQs.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {(metrics?.frequentlySubmittedCategories || []).map(({ category, count }) => (
              <div key={category} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--bg)", borderRadius: "8px" }}>
                <div>
                  <span style={{ fontWeight: "600", fontSize: "14px" }}>{category}</span>
                  <span style={{ marginLeft: "10px", fontSize: "12px", color: "var(--muted)" }}>({count} tickets submitted)</span>
                </div>
                <button
                  className="mini-btn"
                  type="button"
                  onClick={() => openCreateModal({ category })}
                >
                  + Create FAQ for this topic
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
