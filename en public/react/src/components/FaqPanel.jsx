import React, { useState, useEffect } from "react";

export default function FaqPanel() {
  const [faqs, setFaqs] = useState([]);
  const [categories, setCategories] = useState(["All"]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFaqId, setExpandedFaqId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedbackGiven, setFeedbackGiven] = useState({}); // { [faqId]: 'helpful' | 'not_helpful' }
  const [feedbackNotice, setFeedbackNotice] = useState(null);

  const loadFaqs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/faqs", { headers: { Accept: "application/json" } });
      if (res.ok) {
        const data = await res.json();
        const list = data.data || [];
        setFaqs(list);
        const cats = ["All", ...Array.from(new Set(list.map(f => f.category).filter(Boolean)))];
        setCategories(cats);
      }
    } catch (err) {
      console.error("Failed to load FAQs", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFaqs();
  }, []);

  const handleVote = async (faqId, vote) => {
    try {
      const res = await fetch(`/api/faqs/${faqId}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "chama",
          Accept: "application/json"
        },
        body: JSON.stringify({ vote })
      });
      const data = await res.json();
      if (res.ok) {
        setFeedbackGiven(prev => ({ ...prev, [faqId]: vote }));
        setFaqs(prev => prev.map(f => {
          if (f.id === faqId) {
            return {
              ...f,
              helpfulCount: data.helpfulCount,
              notHelpfulCount: data.notHelpfulCount
            };
          }
          return f;
        }));
        setFeedbackNotice({ id: faqId, message: "Thank you for your feedback!" });
        setTimeout(() => setFeedbackNotice(null), 3000);
      }
    } catch (err) {
      console.error("Feedback error", err);
    }
  };

  const handleStillNeedHelp = (faq) => {
    // Dispatch custom event to open the support panel and prefill the category/subject
    const event = new CustomEvent("chama:open-support-ticket", {
      detail: {
        category: faq?.category,
        subject: faq?.question
      }
    });
    window.dispatchEvent(event);

    // Switch to support panel via location hash / chama navigation
    window.location.hash = "#support-panel";
  };

  // Conventional keyword-based search
  const filteredFaqs = faqs.filter(faq => {
    if (selectedCategory !== "All" && faq.category?.toLowerCase() !== selectedCategory.toLowerCase()) {
      return false;
    }
    if (searchQuery.trim()) {
      const term = searchQuery.toLowerCase().trim();
      const matchQ = faq.question?.toLowerCase().includes(term);
      const matchA = faq.answer?.toLowerCase().includes(term);
      const matchC = faq.category?.toLowerCase().includes(term);
      if (!matchQ && !matchA && !matchC) return false;
    }
    return true;
  });

  return (
    <div className="support-shell">
      <div className="support-header-bar">
        <div className="support-title-group">
          <h2>Frequently Asked Questions</h2>
          <p>Find step-by-step guides and answers to common questions about using Jirani Chama.</p>
        </div>
      </div>

      {/* Search Input */}
      <div className="faq-search-box">
        <span aria-hidden="true" style={{ fontSize: "16px" }}>🔍</span>
        <input
          type="text"
          placeholder="Search by keyword (e.g. contribution, loan, PIN, meeting)..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            className="mini-btn"
            style={{ border: "none", background: "transparent", color: "var(--muted)" }}
            onClick={() => setSearchQuery("")}
          >
            Clear
          </button>
        )}
      </div>

      {/* Category Pills */}
      <div className="faq-cat-pills">
        {categories.map(cat => (
          <button
            key={cat}
            type="button"
            className={`faq-pill ${selectedCategory === cat ? "active" : ""}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* FAQ Accordion List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "24px", color: "var(--muted)" }}>Loading questions…</div>
      ) : filteredFaqs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "36px 16px", background: "var(--paper)", borderRadius: "10px", border: "1px solid var(--line)" }}>
          <p style={{ fontSize: "16px", fontWeight: "600", margin: "0 0 6px" }}>No matching answers found</p>
          <p style={{ color: "var(--muted)", margin: "0 0 16px", fontSize: "14px" }}>
            We couldn't find an existing FAQ for "{searchQuery}". Our human support staff is ready to assist you.
          </p>
          <button
            className="button-primary"
            type="button"
            onClick={() => handleStillNeedHelp({ question: searchQuery })}
          >
            Submit a Support Request
          </button>
        </div>
      ) : (
        <div>
          {filteredFaqs.map(faq => {
            const isExpanded = expandedFaqId === faq.id;
            const currentVote = feedbackGiven[faq.id];
            const hasNotice = feedbackNotice && feedbackNotice.id === faq.id;

            return (
              <div key={faq.id} className="faq-accordion-item">
                <button
                  type="button"
                  className="faq-question-btn"
                  onClick={() => setExpandedFaqId(isExpanded ? null : faq.id)}
                  aria-expanded={isExpanded}
                >
                  <span>
                    <span style={{ color: "var(--green)", marginRight: "8px" }}>Q:</span>
                    {faq.question}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--muted)", marginLeft: "12px" }}>
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </button>

                {isExpanded && (
                  <div className="faq-answer-pane">
                    <div className="faq-answer-text">
                      {faq.answer.split("\n").map((line, idx) => (
                        <p key={idx} style={{ margin: "4px 0" }}>{line}</p>
                      ))}
                    </div>

                    <div className="faq-feedback-row">
                      <div className="faq-feedback-btns">
                        <span>Was this helpful?</span>
                        <button
                          type="button"
                          className="faq-feedback-btn"
                          style={currentVote === "helpful" ? { background: "var(--green)", color: "#fff" } : {}}
                          onClick={() => handleVote(faq.id, "helpful")}
                        >
                          👍 Yes ({faq.helpfulCount || 0})
                        </button>
                        <button
                          type="button"
                          className="faq-feedback-btn"
                          style={currentVote === "not_helpful" ? { background: "var(--red)", color: "#fff" } : {}}
                          onClick={() => handleVote(faq.id, "not_helpful")}
                        >
                          👎 No ({faq.notHelpfulCount || 0})
                        </button>
                        {hasNotice && (
                          <span style={{ color: "var(--green)", marginLeft: "6px" }}>
                            {feedbackNotice.message}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        className="mini-btn"
                        onClick={() => handleStillNeedHelp(faq)}
                      >
                        Still need help with this? →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Persistent "Still need help?" Banner */}
      <div className="faq-need-help-banner">
        <div>
          <h4>Still have questions or running into issues?</h4>
          <p>Our dedicated human support team is ready to help resolve your questions.</p>
        </div>
        <button
          className="button-primary"
          type="button"
          onClick={() => handleStillNeedHelp(null)}
        >
          Submit Support Ticket
        </button>
      </div>
    </div>
  );
}
