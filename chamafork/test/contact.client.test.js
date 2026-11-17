"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");

const clientPath = path.join(__dirname, "..", "..", "en public", "contact.js");
const clientSource = fs.readFileSync(clientPath, "utf8");

async function submitWithResponse(status, ok = status < 400) {
  let submitHandler;
  let resetCount = 0;
  const buttonLabel = { textContent: "Send message" };
  const form = {
    addEventListener(type, handler) {
      assert.equal(type, "submit");
      submitHandler = handler;
    },
    reportValidity: () => true,
    setAttribute() {},
    removeAttribute() {},
    reset() { resetCount += 1; }
  };
  const submitButton = { disabled: false, querySelector: () => buttonLabel };
  const feedback = { textContent: "", dataset: {}, hidden: true };
  const elements = {
    "#contact-form": form,
    "#contact-submit": submitButton,
    "#contact-feedback": feedback
  };
  class FormDataMock {
    entries() {
      return Object.entries({
        name: "Eli Example",
        email: "eli@example.test",
        subject: "Question",
        message: "A sufficiently long message."
      });
    }
  }

  vm.runInNewContext(clientSource, {
    document: { querySelector: selector => elements[selector] || null },
    window: { jiraniI18n: { translateText: text => `sw:${text}` } },
    FormData: FormDataMock,
    fetch: async (url, options) => {
      assert.equal(url, "/api/contact");
      assert.equal(options.method, "POST");
      assert.equal(options.headers["X-Requested-With"], "chama");
      return { status, ok };
    }
  });

  await submitHandler({ preventDefault() {} });
  return { feedback, buttonLabel, submitButton, resetCount };
}

test("AI unanswered-question submissions include the user's email and original question", async () => {
  const actionsPath = path.join(__dirname, "..", "..", "en public", "react", "src", "contactActions.mjs");
  const { submitUnansweredSupportQuestion } = await import(pathToFileURL(actionsPath).href);
  const expectedResponse = { ok: true, status: 200 };
  let request;

  const response = await submitUnansweredSupportQuestion({
    email: "  member@example.test ",
    question: "How do I challenge a disputed audit entry?",
  }, async (url, options) => {
    request = { url, options };
    return expectedResponse;
  });

  assert.equal(response, expectedResponse);
  assert.equal(request.url, "/api/contact");
  assert.equal(request.options.credentials, "same-origin");
  assert.deepEqual(JSON.parse(request.options.body), {
    name: "Jirani Chama AI Assistant",
    email: "member@example.test",
    subject: "Unanswered question from Jirani Chama AI Assistant",
    message: "Question asked in the AI support chat:\n\nHow do I challenge a disputed audit entry?",
  });
});

test("contact client reports all server errors as delivery failures, never validation or success", async () => {
  const unavailable = "Email delivery is temporarily unavailable. Please try again later or email us directly.";
  for (const status of [500, 502, 503]) {
    const result = await submitWithResponse(status);
    assert.equal(result.feedback.textContent, `sw:${unavailable}`);
    assert.equal(result.feedback.dataset.state, "error");
    assert.equal(result.resetCount, 0);
    assert.equal(result.submitButton.disabled, false);
  }
});

test("contact client keeps input, rate-limit, and other request failures distinct", async () => {
  const invalid = await submitWithResponse(400);
  assert.equal(invalid.feedback.textContent, "sw:Please review the required fields and try again.");

  const limited = await submitWithResponse(429);
  assert.equal(limited.feedback.textContent, "sw:Too many messages were sent. Please try again later.");

  const rejected = await submitWithResponse(403);
  assert.equal(rejected.feedback.textContent, "sw:We couldn’t send your message just now. Please try again or email us directly.");
  assert.equal(rejected.feedback.dataset.state, "error");
  assert.equal(rejected.resetCount, 0);
});

test("contact client clears the form and shows success only after a successful response", async () => {
  const result = await submitWithResponse(200, true);
  assert.equal(result.resetCount, 1);
  assert.equal(result.feedback.dataset.state, "success");
  assert.equal(result.feedback.textContent, "sw:Your message has been sent. Thanks for contacting us.");
});
