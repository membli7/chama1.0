"use strict";

const registrationForm = document.querySelector("#register-chama-form");
const registrationNotice = document.querySelector("#register-notice");
const translateRegistrationText = value => window.jiraniI18n?.translateText(value) || value;
const registrationAgeDialog = document.querySelector("#register-age-dialog");
const registrationAgeBlock = document.querySelector("#register-age-block");
const registrationAgeConfirmed = registrationForm.querySelector("#register-age-confirmed");
const registrationSubmitButton = registrationForm.querySelector('button[type="submit"]');
let registrationSubmitting = false;

function updateRegistrationAgeGate() {
  const answer = registrationAgeConfirmed.value || "";
  registrationSubmitButton.disabled = answer !== "true" || registrationSubmitting;
}

registrationAgeDialog.addEventListener("cancel", event => event.preventDefault());
registrationAgeDialog.querySelectorAll("[data-age-answer]").forEach(button => {
  button.addEventListener("click", () => {
    if (button.dataset.ageAnswer !== "true") {
      registrationAgeBlock.hidden = false;
      return;
    }
    registrationAgeBlock.hidden = true;
    registrationAgeConfirmed.value = "true";
    registrationForm.hidden = false;
    registrationAgeDialog.close();
    updateRegistrationAgeGate();
    registrationForm.querySelector('input:not([type="hidden"])')?.focus();
  });
});
updateRegistrationAgeGate();

registrationForm.addEventListener("submit", async event => {
  event.preventDefault();
  const formData = Object.fromEntries(new FormData(registrationForm));
  if (formData.ageConfirmed !== "true") {
    registrationAgeBlock.hidden = false;
    if (!registrationAgeDialog.open) registrationAgeDialog.showModal();
    return;
  }
  registrationSubmitting = true;
  updateRegistrationAgeGate();
  registrationNotice.hidden = true;
  registrationNotice.textContent = "";

  try {
    const bootstrapSecret = typeof formData.bootstrapSecret === "string" ? formData.bootstrapSecret : "";
    delete formData.bootstrapSecret;
    formData.deadlineDay = Number(formData.deadlineDay);
    formData.welfareMonthlyFee = Number(formData.welfareMonthlyFee);
    formData.lateContributionPenalty = Number(formData.lateContributionPenalty);
    formData.loanMonthlyRatePercent = Number(formData.loanMonthlyRatePercent);
    const response = await fetch("/api/setup", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "chama",
        ...(bootstrapSecret ? { "X-Setup-Bootstrap-Secret": bootstrapSecret } : {})
      },
      body: JSON.stringify(formData)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok && response.status === 409 && result.message === "Initial setup has already been completed.") {
      const loginResponse = await fetch("/api/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "chama"
        },
        body: JSON.stringify({ phone: formData.phone, pin: formData.pin })
      });
      const loginResult = await loginResponse.json().catch(() => ({}));
      if (loginResponse.ok && !Array.isArray(loginResult.chooseChamaId)) {
        window.location.assign("/");
        return;
      }
      if (loginResponse.status === 401) {
        throw new Error("This chama is already registered. Sign in with the phone number and PIN used for its Chairperson account.");
      }
      if (Array.isArray(loginResult.chooseChamaId)) {
        window.location.assign("/member-login.html");
        return;
      }
      throw new Error(loginResult.message || "This chama is already registered. Please sign in with its Chairperson account.");
    }
    if (!response.ok) throw new Error(result.message || "Could not register the chama. Please try again.");

    window.location.assign("/");
  } catch (error) {
    registrationNotice.textContent = translateRegistrationText(error instanceof TypeError
      ? "Cannot reach the server. Check that it is running, then try again."
      : error.message);
    registrationNotice.hidden = false;
  } finally {
    const bootstrapField = registrationForm.elements?.namedItem?.("bootstrapSecret");
    if (bootstrapField) bootstrapField.value = "";
    registrationSubmitting = false;
    updateRegistrationAgeGate();
  }
});

if (new URLSearchParams(window.location.search).get("new-chama") === "1") {
  fetch("/api/setup", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } })
    .then(async response => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Could not check whether this instance is ready for setup.");
      return result;
    })
    .then(result => {
      if (!registrationAgeDialog.open) registrationAgeDialog.showModal();
    })
    .catch(error => {
      registrationNotice.textContent = translateRegistrationText(error instanceof TypeError
        ? "Cannot reach the server. Check that it is running, then try again."
        : error.message);
      registrationNotice.hidden = false;
      if (!registrationAgeDialog.open) registrationAgeDialog.showModal();
    });
} else {
  registrationAgeDialog.showModal();
}
