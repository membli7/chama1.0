import fs from "node:fs";
import path from "node:path";

const root = "C:/Users/ADMIN/Desktop/chama1.0";

function replaceOnce(relativePath, oldText, newText) {
  const fullPath = path.join(root, relativePath);
  const source = fs.readFileSync(fullPath, "utf8");
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${relativePath}: expected one exact match, found ${count}`);
  fs.writeFileSync(fullPath, source.replace(oldText, newText), "utf8");
}

function replaceRegexOnce(relativePath, expression, newText) {
  const fullPath = path.join(root, relativePath);
  const source = fs.readFileSync(fullPath, "utf8");
  const matches = [...source.matchAll(new RegExp(expression.source, expression.flags.includes("g") ? expression.flags : `${expression.flags}g`))];
  if (matches.length !== 1) throw new Error(`${relativePath}: expected one regex match, found ${matches.length}`);
  fs.writeFileSync(fullPath, source.replace(expression, newText), "utf8");
}

replaceOnce(
  "en public/terms.html",
  "<p>The App supports loan terms of 1, 2, 3, or 6 months and calculates a repayment schedule using the Chama’s configured monthly rate and the selected interest model. Repayments are applied to interest before principal under the reviewed product rule. Before any money is advanced, the Chama or actual lender must separately provide and agree clear loan terms, including the applicable rate and method, total amount payable, due dates, fees, guarantor obligations and release, and consequences of late payment or default. Do not assume the App’s approval record is a loan agreement, a complete cost disclosure, or confirmation that a transfer occurred. The App does not transfer or disburse funds.</p>",
  "<p>For a new application, the App supports loan terms of 1, 2, 3, or 6 months and uses a reducing-balance monthly-interest model. Each Chama’s monthly rate is stored separately and is included in a server-generated estimate shown before submission, including estimated interest, total payable, and the installment amounts and due dates. The estimate uses the amount, term, current Chama rate, and current server calculation; it is not a binding offer, does not reserve funds, and does not confirm an external transfer. An approved record stores the rate and repayment schedule used for that decision. Repayments are applied to interest before principal under the reviewed product rule. This build has no officer/member screen for changing the rate after Chama setup. Before any rate is changed outside setup, the Chama must authorize it and the product must provide a controlled, auditable change process; otherwise new applications should not be made on a rate that has changed without notice. Because the App neither transfers funds nor records the actual off-app disbursement date, do not treat the approval record or projected schedule alone as proof that a loan was advanced or as a complete loan agreement. Before money is advanced, the actual lender must confirm the amount and date advanced, rate and method, total amount payable, due dates, fees, guarantor obligations and release, and consequences of late payment or default.</p>"
);

replaceOnce(
  "en public/terms.html",
  "<h3 id=\"42-records-and-calculations\">4.2 Records and calculations</h3>4.2 Records and calculations</h3>",
  "<h3 id=\"42-records-and-calculations\">4.2 Records and calculations</h3>"
);

replaceRegexOnce(
  "en public/privacy.html",
  /<tr><td>Loans, guarantors, automated decisions, and repayments<\/td>[\s\S]*?<\/tr>/,
  "<tr><td>Loans, estimates, guarantors, automated decisions, and repayments</td><td>Requested amount and term; Chama-specific monthly rate; estimated interest, total payable, and installment amounts/due dates; applied rate and saved schedule; borrower, principal, outstanding amount, membership-start date/days, recorded share-capital contributions, Chama balance, existing principal, selected amount tier and policy version, guarantor identities and pledged/unpledged share-capital capacity, decision criteria/reasons, human-review request and response, repayments, principal/interest allocation, methods, references, and dates</td><td>Estimates and records a Chama loan request, explains an automated decision, and records later repayment or review. These may reveal a person’s financial circumstances; verify actual production fields and role access before publication.</td></tr>"
);

replaceRegexOnce(
  "en public/privacy.html",
  /<tr><td>Assess and explain loan eligibility; handle a human-review request<\/td>[\s\S]*?<\/tr>/,
  "<tr><td>Estimate and explain loan costs, assess eligibility, and handle human review</td><td>Requested amount and term; Chama-specific monthly rate; estimated interest, total payable, installments and due dates; recorded membership duration and share-capital contributions; Chama-recorded balance; existing principal; configured amount tier; selected guarantors and available share capital; saved rate and schedule; policy version; decision, criteria, reasons, and review records</td><td><strong>[The relevant Chama/controller must identify the lawful basis, explain the estimate and rule-based decision and likely effects, verify the source records and group rules, and document the Operator’s role. Assess Data Protection Act section 35, General Regulations 22 and 49, and any credit-provider rules that apply to the actual entity and lending model.]</strong></td></tr>"
);

replaceOnce(
  "en public/privacy.html",
  "<p>The calculation uses information recorded in the App, including membership-start dates, contribution and loan records, the group balance, and guarantor records. The controller must check those records for accuracy, explain the thresholds and likely consequences in advance, and protect the information from use for unrelated purposes. A recorded balance or contribution is not independent proof that money was received or remains available.</p>",
  "<p>The calculation uses information recorded in the App, including membership-start dates, contribution and loan records, the group balance, and guarantor records. The controller must check those records for accuracy, explain the thresholds and likely consequences in advance, and protect the information from use for unrelated purposes. A recorded balance or contribution is not independent proof that money was received or remains available.</p><p>Before submission, the member can request a server-generated estimate for the amount and term. It uses the Chama’s current monthly rate and the reducing-balance model and returns estimated interest, total payable, and installment amounts and due dates. An estimate does not submit an application, reserve funds, or confirm an off-App transfer. If the application is approved, the loan record stores the rate and schedule used for that decision. The App does not record or perform the actual disbursement, so the controller and actual lender must separately confirm the amount and date advanced and must not treat the projected schedule alone as proof that a loan was funded.</p>"
);

console.log("Updated public HTML loan disclosures and repaired the duplicated Terms heading.");
