import { useEffect, useRef, useState } from "react";
import { registerChama, setupIsOpen } from "../registrationActions.mjs";

function translate(value) {
  return window.jiraniI18n?.translateText(value) || value;
}

const AGE_ELIGIBILITY_MESSAGE = "You must be 18 years old or older to create an account.";

export default function RegisterPage() {
  const rootRef = useRef(null);
  const formRef = useRef(null);
  const ageGateDialogRef = useRef(null);
  const checkSetupBeforeShowingForm = new URLSearchParams(window.location.search).get("new-chama") === "1";
  const [notice, setNotice] = useState("");
  const [ageGateNotice, setAgeGateNotice] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [registrationPageReady, setRegistrationPageReady] = useState(!checkSetupBeforeShowingForm);

  useEffect(() => {
    document.title = "Register a new chama | Jirani Chama";
    document.body.className = "";
    const applyTranslations = () => window.jiraniI18n?.apply(rootRef.current || document.documentElement);
    applyTranslations();
    window.addEventListener("languagechange", applyTranslations);
    return () => window.removeEventListener("languagechange", applyTranslations);
  }, []);

  useEffect(() => {
    window.jiraniI18n?.apply(rootRef.current || document.documentElement);
  }, [notice, ageGateNotice, ageConfirmed, submitting]);

  useEffect(() => {
    if (!registrationPageReady || ageConfirmed === "true") return undefined;
    const dialog = ageGateDialogRef.current;
    if (!dialog) return undefined;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, [registrationPageReady, ageConfirmed]);

  useEffect(() => {
    if (ageConfirmed === "true") formRef.current?.querySelector('input:not([type="hidden"])')?.focus();
  }, [ageConfirmed]);

  useEffect(() => {
    if (!checkSetupBeforeShowingForm) return undefined;
    let active = true;
    setupIsOpen().then(open => {
      if (!active) return;
      if (open) setRegistrationPageReady(true);
      else setRegistrationPageReady(true);
    }).catch(error => {
      if (!active) return;
      const message = error instanceof TypeError
        ? "Cannot reach the server. Check that it is running, then try again."
        : error.message;
      setNotice(translate(message));
      setRegistrationPageReady(true);
    });
    return () => { active = false; };
  }, [checkSetupBeforeShowingForm]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!formRef.current) return;
    const values = Object.fromEntries(new FormData(formRef.current).entries());
    if (values.ageConfirmed !== "true") {
      setAgeGateNotice(AGE_ELIGIBILITY_MESSAGE);
      if (!ageGateDialogRef.current?.open) ageGateDialogRef.current?.showModal();
      return;
    }
    setSubmitting(true);
    setNotice("");
    try {
      await registerChama(values, {
        fetcher: window.fetch.bind(window),
        navigate: destination => window.location.assign(destination),
      });
    } catch (error) {
      const message = error instanceof TypeError
        ? "Cannot reach the server. Check that it is running, then try again."
        : error.message;
      setNotice(translate(message));
    } finally {
      const bootstrapField = formRef.current?.elements?.namedItem("bootstrapSecret");
      if (bootstrapField) bootstrapField.value = "";
      setSubmitting(false);
    }
  }

  function handleAgeAnswer(answer) {
    if (answer !== "true") {
      setAgeGateNotice(AGE_ELIGIBILITY_MESSAGE);
      return;
    }
    setAgeGateNotice("");
    setAgeConfirmed("true");
    ageGateDialogRef.current?.close();
  }

  return (
    <div className="react-registration-page" ref={rootRef}>
      <header className="topbar auth-page-topbar">
        <a className="brand" href="/" aria-label="Jirani Chama home">
          <span className="brand-mark" aria-hidden="true"><img src="/brand-mark.svg" alt="" /></span>
          <span>Jirani Chama <small>GROUP SAVINGS</small></span>
        </a>
        <label className="language-control" htmlFor="language-switch" data-i18n="language">Language
          <select id="language-switch" aria-label="Language" data-i18n-aria-label="language" defaultValue="en">
            <option value="en" data-i18n="englishOption">English</option>
            <option value="sw" data-i18n="swahili">Kiswahili</option>
          </select>
        </label>
      </header>
      <main id="auth-page" className="login-overlay">
        <div className="login-content">
          <section className="login-brand">
            <p className="login-eyebrow">Jirani Chama</p>
            <h1>Start a new chama</h1>
            <p className="login-intro">Register your group and create the chairperson account. You will be signed in when setup is complete.</p>
          </section>
          <section className="auth-page-forms" aria-label="New chama registration" data-i18n-aria-label="newChamaRegistration">
                        <form id="register-chama-form" className="login-card" ref={formRef} onSubmit={handleSubmit} hidden={ageConfirmed !== "true"}>
              <h2>Chama and chairperson details</h2>
              <p className="form-note"><span data-i18n="policyReviewPrompt">Before entering your details, review:</span>{" "}<a href="/terms.html" target="_blank" rel="noopener noreferrer" data-i18n="termsAndConditions">Terms and Conditions</a> · <a href="/privacy.html" target="_blank" rel="noopener noreferrer" data-i18n="privacyNotice">Privacy Notice</a></p>
              <p>All fields are required. Your PIN must have 6 to 12 digits.</p>
              <p id="register-notice" className="login-notice" role="alert" aria-live="assertive" hidden={!notice}>{notice}</p>
              <input id="register-age-confirmed" name="ageConfirmed" type="hidden" value={ageConfirmed === "true" ? "true" : ""} />
              <label className="field" htmlFor="register-bootstrap-secret" data-i18n="setupBootstrapLabel">Operator bootstrap code (if requested)
                <input id="register-bootstrap-secret" name="bootstrapSecret" type="password" autoComplete="off" maxLength={256} aria-describedby="register-bootstrap-note" spellCheck={false} />
              </label>
              <p id="register-bootstrap-note" className="form-note" data-i18n="setupBootstrapNote">For production setup, enter the code supplied by the operator. It is used only for first-time setup and is not saved with your account.</p>
              <label className="field" htmlFor="register-chama-name">Chama name
                <input id="register-chama-name" name="chamaName" type="text" maxLength={100} autoComplete="organization" required />
              </label>
              <label className="field" htmlFor="register-chairperson-name">Chairperson full name
                <input id="register-chairperson-name" name="name" type="text" maxLength={100} autoComplete="name" required />
              </label>
              <label className="field" htmlFor="register-chairperson-phone">Phone number
                <input id="register-chairperson-phone" name="phone" type="tel" autoComplete="tel" required />
              </label>
              <label className="field" htmlFor="register-chairperson-email">Email address
                <input id="register-chairperson-email" name="email" type="email" maxLength={254} autoComplete="email" required />
              </label>
              <fieldset className="register-rules">
                <legend>Financial rules</legend>
                <p className="form-note">These defaults can be changed for this chama. They are enforced by the server.</p>
                <label className="field" htmlFor="register-deadline-day">Monthly contribution due by day
                  <input id="register-deadline-day" name="deadlineDay" type="number" min={1} max={28} defaultValue={5} required />
                </label>
                <label className="field" htmlFor="register-welfare-fee">Monthly welfare contribution (KES)
                  <input id="register-welfare-fee" name="welfareMonthlyFee" type="number" min={0} step={1} defaultValue={500} required />
                </label>
                <label className="field" htmlFor="register-late-penalty">Late contribution penalty (KES)
                  <input id="register-late-penalty" name="lateContributionPenalty" type="number" min={0} step={1} defaultValue={200} required />
                </label>
                <label className="field" htmlFor="register-loan-rate">Monthly loan interest (%)
                  <input id="register-loan-rate" name="loanMonthlyRatePercent" type="number" min={0} max={100} step={0.1} defaultValue={5} required />
                </label>
              </fieldset>
              <label className="field" htmlFor="register-chairperson-pin">Create PIN
                <input id="register-chairperson-pin" name="pin" type="password" inputMode="numeric" autoComplete="new-password" minLength={6} maxLength={12} pattern="[0-9]{6,12}" required />
              </label>
              <label className="terms-acceptance" htmlFor="register-terms-accepted">
                <input id="register-terms-accepted" name="termsAccepted" type="checkbox" value="true" required />
                <span><span data-i18n="termsAcceptanceLead">I have read and agree to the</span>{" "}<a href="/terms.html" target="_blank" rel="noopener noreferrer" data-i18n="termsAndConditions">Terms and Conditions</a></span>
              </label>
              <label className="terms-acceptance" htmlFor="register-privacy-acknowledged">
                <input id="register-privacy-acknowledged" name="privacyNoticeAcknowledged" type="checkbox" value="true" required />
                <span><span data-i18n="privacyAcknowledgementLead">I acknowledge that I have read the</span>{" "}<a href="/privacy.html" target="_blank" rel="noopener noreferrer" data-i18n="privacyNotice">Privacy Notice</a><br /><span data-i18n="privacyAcknowledgementNote">This confirms receipt of the notice; it is not consent to unrelated processing.</span></span>
              </label>
              <button className="button-primary" type="submit" disabled={submitting || ageConfirmed !== "true"}>{submitting ? "Registering…" : "Register chama"}</button>
              <p className="auth-page-links"><a href="/">Back to home</a> · <a href="/member-login.html" data-i18n="memberLogin">Member Login</a></p>
            </form>
            <dialog id="register-age-dialog" ref={ageGateDialogRef} className="age-gate-dialog" aria-labelledby="register-age-title" aria-describedby="register-age-description" onCancel={event => event.preventDefault()}>
              <h2 id="register-age-title">Are you 18 years old or older?</h2>
              <p id="register-age-description">Choose Yes to continue. This is a self-declaration; we do not ask for your exact age, date of birth, or identity document.</p>
              <div className="age-gate-actions">
                <button className="age-gate-button age-gate-button--yes" type="button" data-age-answer="true" autoFocus onClick={() => handleAgeAnswer("true")}>Yes</button>
                <button className="age-gate-button age-gate-button--no" type="button" data-age-answer="false" onClick={() => handleAgeAnswer("false")}>No</button>
              </div>
              <p id="register-age-block" className="age-gate-message" role="alert" aria-live="assertive" hidden={!ageGateNotice}>{ageGateNotice}</p>
            </dialog>
            <section id="register-success" className="login-card" aria-live="polite" hidden>
              <h2>Chama registered</h2>
              <p>Your chairperson account is ready. Continue to your chama dashboard.</p>
              <a className="button-primary" href="/">Open dashboard</a>
            </section>
          </section>
        </div>
      </main>
    </div>
  );
}
