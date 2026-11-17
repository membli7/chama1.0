export function submitContact(values, fetcher = globalThis.fetch) {
  return fetcher("/api/contact", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "chama",
    },
    body: JSON.stringify(values),
  });
}

export function submitUnansweredSupportQuestion({ email, question }, fetcher = globalThis.fetch) {
  return submitContact({
    name: "Jirani Chama AI Assistant",
    email: String(email || "").trim(),
    subject: "Unanswered question from Jirani Chama AI Assistant",
    message: `Question asked in the AI support chat:\n\n${String(question || "").trim()}`,
  }, fetcher);
}
