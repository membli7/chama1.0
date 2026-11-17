import React, { useState, useEffect, useRef } from "react";

const CHAT_COPY = {
  en: {
    welcome: "👋 **Hello! I am your Jirani Chama AI Assistant.**\n\nI can answer questions about contributions, loan limits, meeting attendance, PIN changes, and group rules. How can I assist you today?",
    welcomeActions: ["Request a Loan", "View Ledger", "Talk to Human Support"],
    related: ["How do I request a loan?", "How are monthly contributions recorded?", "What if I forgot my PIN?", "Talk to human support"],
    cleared: "Conversation cleared. How can I assist you with Jirani Chama today?",
    error: "I am having trouble answering right now. You can check our FAQs or submit a ticket directly to human support staff.",
    trigger: "AI Support",
    openAssistant: "Open AI Support Assistant",
    askJirani: "Ask Jirani AI",
    title: "Jirani AI Support",
    subtitle: "In-App Smart Assistant",
    clear: "Clear conversation",
    close: "Close chat",
    suggested: "Suggested questions:",
    placeholder: "Ask a question about Jirani Chama...",
    send: "Send message",
    privacy: "In-App Assistant • 100% Private • ",
    contact: "Contact human staff",
    humanAction: "Talk to Human Support",
    faqAction: "Browse FAQs"
  },
  sw: {
    welcome: "👋 **Habari! Mimi ni msaidizi wako wa AI wa Jirani Chama.**\n\nNaweza kujibu maswali kuhusu michango, mipaka ya mikopo, mahudhurio ya mikutano, kubadilisha PIN na sheria za kikundi. Nikusaidie vipi leo?",
    welcomeActions: ["Omba mkopo", "Tazama taarifa za hesabu", "Wasiliana na mhudumu wa msaada"],
    related: ["Ninawezaje kuomba mkopo?", "Michango ya kila mwezi hurekodiwaje?", "Nifanye nini nikisahau PIN yangu?", "Wasiliana na mhudumu wa msaada"],
    cleared: "Mazungumzo yamefutwa. Nikusaidie vipi kuhusu Jirani Chama leo?",
    error: "Samahani, siwezi kujibu kwa sasa. Unaweza kuangalia maswali yanayoulizwa mara kwa mara au kutuma ombi kwa wahudumu wa msaada.",
    trigger: "Msaada wa AI",
    openAssistant: "Fungua msaidizi wa msaada wa AI",
    askJirani: "Uliza Jirani AI",
    title: "Msaada wa Jirani AI",
    subtitle: "Msaidizi Mahiri wa Ndani ya Programu",
    clear: "Futa mazungumzo",
    close: "Funga mazungumzo",
    suggested: "Maswali yaliyopendekezwa:",
    placeholder: "Uliza swali kuhusu Jirani Chama...",
    send: "Tuma ujumbe",
    privacy: "Msaidizi wa ndani • Taarifa ni za faragha • ",
    contact: "Wasiliana na wahudumu",
    humanAction: "Wasiliana na mhudumu wa msaada",
    faqAction: "Angalia maswali yanayoulizwa mara kwa mara"
  }
};

function getAssistantLanguage() {
  return window.jiraniI18n?.getLanguage?.() === "sw" ? "sw" : "en";
}

function createWelcomeMessage(language, id = "msg-welcome") {
  const copy = CHAT_COPY[language];
  const labels = copy.welcomeActions;
  return {
    id,
    sender: "ai",
    language,
    text: copy.welcome,
    actions: [
      { label: labels[0], target: "#loans-panel", action: "navigate" },
      { label: labels[1], target: "#ledger-panel", action: "navigate" },
      { label: labels[labels.length - 1], target: "#support-panel", action: "open_ticket" }
    ],
    related: copy.related,
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };
}

export default function AiSupportBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [language, setLanguage] = useState(getAssistantLanguage);
  const copy = CHAT_COPY[language];
  const [messages, setMessages] = useState(() => [createWelcomeMessage(getAssistantLanguage())]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/support/ai/suggestions?language=${language}`, { signal: controller.signal })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.data && Array.isArray(data.data)) {
          setSuggestions(data.data);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [language]);

  useEffect(() => {
    const updateLanguage = event => {
      const nextLanguage = event?.detail?.language || getAssistantLanguage();
      setLanguage(nextLanguage === "sw" ? "sw" : "en");
    };
    window.addEventListener("languagechange", updateLanguage);
    return () => window.removeEventListener("languagechange", updateLanguage);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        scrollToBottom();
      }, 100);
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = async (textToSend) => {
    const query = (textToSend || inputValue).trim();
    if (!query) return;

    const userMsg = {
      id: `usr-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputValue("");
    setIsTyping(true);

    try {
      const res = await fetch("/api/support/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "chama",
          Accept: "application/json",
        },
        body: JSON.stringify({ message: query, language }),
      });

      if (!res.ok) {
        throw new Error("Unable to get an answer right now.");
      }

      const resData = await res.json();
      const aiData = resData.data;

      // Small natural delay for pleasant UX
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [
          ...prev.map(message => message.id === userMsg.id
            ? { ...message, language: aiData.language || language }
            : message),
          {
            id: `ai-${Date.now()}`,
            sender: "ai",
            language: aiData.language || language,
            text: aiData.reply,
            actions: aiData.actions || [],
            related: aiData.related || [],
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          }
        ]);
      }, 350);
    } catch {
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            sender: "ai",
            language,
            text: copy.error,
            actions: [
              { label: copy.humanAction, target: "#support-panel", action: "open_ticket" },
              { label: copy.faqAction, target: "#faq-panel", action: "navigate" }
            ],
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          }
        ]);
      }, 350);
    }
  };

  const handleActionClick = (act) => {
    if (act.action === "open_ticket") {
      const event = new CustomEvent("chama:open-support-ticket", {
        detail: { category: "Other", subject: language === "sw" ? "Swali kutoka kwa msaidizi wa AI" : "Inquiry from AI Assistant" },
      });
      window.dispatchEvent(event);
      window.location.hash = "#support-panel";
      setIsOpen(false);
    } else if (act.target) {
      window.location.hash = act.target;
      setIsOpen(false);
    }
  };

  const handleClearChat = () => {
    setMessages([{ ...createWelcomeMessage(language, "msg-welcome-new"), text: copy.cleared }]);
  };

  // Simple formatting helper for markdown-style bold, bullet points, headers
  const renderFormattedText = (raw) => {
    const lines = raw.split("\n");
    return lines.map((line, idx) => {
      if (line.startsWith("### ")) {
        return <h4 key={idx} className="ai-bubble-h4">{line.replace("### ", "")}</h4>;
      }
      if (line.startsWith("• ") || line.startsWith("* ")) {
        return (
          <li key={idx} className="ai-bubble-li">
            {formatSpans(line.replace(/^[•*]\s*/, ""))}
          </li>
        );
      }
      if (/^\d+\.\s+/.test(line)) {
        return (
          <div key={idx} className="ai-bubble-step">
            {formatSpans(line)}
          </div>
        );
      }
      if (!line.trim()) {
        return <div key={idx} style={{ height: "6px" }} />;
      }
      return <p key={idx} className="ai-bubble-p">{formatSpans(line)}</p>;
    });
  };

  const formatSpans = (text) => {
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("*") && part.endsWith("*")) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      return part;
    });
  };

  return (
    <div className="ai-bubble-container" aria-label={copy.title} lang={language} translate="no">
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          type="button"
          className="ai-bubble-trigger-btn"
          onClick={() => setIsOpen(true)}
          aria-expanded={false}
          aria-label={copy.openAssistant}
          title={copy.askJirani}
        >
          <div className="ai-bubble-trigger-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <circle cx="9" cy="10" r="1" fill="currentColor" />
              <circle cx="15" cy="10" r="1" fill="currentColor" />
            </svg>
          </div>
          <span className="ai-bubble-trigger-label">{copy.trigger}</span>
          <span className="ai-bubble-pulse-dot" />
        </button>
      )}

      {/* Floating Chat Window */}
      {isOpen && (
        <div className="ai-bubble-window" role="dialog" aria-modal="true" aria-label={copy.title}>
          {/* Header */}
          <div className="ai-bubble-header">
            <div className="ai-bubble-header-info">
              <div className="ai-bubble-avatar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <circle cx="12" cy="5" r="2" />
                  <path d="M12 7v4" />
                  <line x1="8" y1="16" x2="8.01" y2="16" />
                  <line x1="16" y1="16" x2="16.01" y2="16" />
                </svg>
                <span className="ai-online-status" />
              </div>
              <div>
                <h3 className="ai-bubble-title">{copy.title}</h3>
                <span className="ai-bubble-subtitle">{copy.subtitle}</span>
              </div>
            </div>
            <div className="ai-bubble-header-actions">
              <button
                type="button"
                className="ai-bubble-icon-btn"
                title={copy.clear}
                aria-label={copy.clear}
                onClick={handleClearChat}
              >
                🗑️
              </button>
              <button
                type="button"
                className="ai-bubble-icon-btn"
                title={copy.close}
                aria-label={copy.close}
                onClick={() => setIsOpen(false)}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages Body */}
          <div className="ai-bubble-messages">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`ai-bubble-msg-row ${msg.sender === "user" ? "user-row" : "ai-row"}`}
              >
                {msg.sender === "ai" && (
                  <div className="ai-msg-avatar" aria-hidden="true">
                    🤖
                  </div>
                )}
                <div className={`ai-bubble-msg-bubble ${msg.sender === "user" ? "user-bubble" : "ai-bubble"}`}>
                  <div className="ai-bubble-msg-content" lang={msg.language || (msg.sender === "user" ? undefined : language)} dir="auto">
                    {msg.sender === "user" ? msg.text : renderFormattedText(msg.text)}
                  </div>

                  {/* Actions inside AI messages */}
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="ai-bubble-actions-row">
                      {msg.actions.map((act, aIdx) => (
                        <button
                          key={aIdx}
                          type="button"
                          className="ai-bubble-action-btn"
                          onClick={() => handleActionClick(act)}
                        >
                          {act.label} →
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Related follow-up suggestions */}
                  {msg.related && msg.related.length > 0 && (
                    <div className="ai-bubble-related-group">
                      <span className="ai-bubble-related-title">{copy.suggested}</span>
                      <div className="ai-bubble-related-chips">
                        {msg.related.map((q, qIdx) => (
                          <button
                            key={qIdx}
                            type="button"
                            className="ai-bubble-chip"
                            onClick={() => handleSendMessage(q)}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <span className="ai-bubble-msg-time">{msg.timestamp}</span>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="ai-bubble-msg-row ai-row">
                <div className="ai-msg-avatar" aria-hidden="true">🤖</div>
                <div className="ai-bubble-msg-bubble ai-bubble typing-bubble">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Starter Chips */}
          {messages.length === 1 && suggestions.length > 0 && (
            <div className="ai-bubble-starter-bar">
              {suggestions.slice(0, 3).map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="ai-bubble-starter-chip"
                  onClick={() => handleSendMessage(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input Footer */}
          <form
            className="ai-bubble-footer"
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              placeholder={copy.placeholder}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="ai-bubble-input"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isTyping}
              className="ai-bubble-send-btn"
              title={copy.send}
              aria-label={copy.send}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>

          {/* Privacy & Escalate Note */}
          <div className="ai-bubble-disclaimer">
            <span>{copy.privacy}</span>
            <button
              type="button"
              className="ai-bubble-link-btn"
              onClick={() => {
                handleActionClick({ action: "open_ticket" });
              }}
            >
              {copy.contact}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
