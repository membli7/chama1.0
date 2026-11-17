# Chama legal audit working notes — 13 Nov 2026

This is internal working context for the legal-gap review, not legal advice or a release-ready report. The user asked for an audit/recommendations only: do not contact Rue; do not change loan balances, approval, or disbursement behavior. This checkout has earlier uncommitted policy/acceptance work and has not been deployed or committed; no source or policy files were changed during this audit continuation.

## Primary official sources opened

- Kenya Data Protection Act, 2019 (Kenya Law): https://kenyalaw.org/akn/ke/act/2019/24/eng@2022-12-31
  - s.25: lawful/fair/transparent processing, purpose limitation, minimization, accuracy, storage limitation and conditions on transfers outside Kenya.
  - s.29: before collecting data, as far as practicable, inform people of collection/purpose, rights, recipients and transfer safeguards, controller/processor contacts and other recipients, security measures, whether collection is mandatory/voluntary, and consequences of not providing data.
  - s.31: DPIA before processing likely to create high risk; consult the Commissioner if the DPIA indicates high risk.
  - s.33: do not process a child’s personal data unless parent/guardian consent is given and processing protects/advances the child’s rights and best interests; incorporate age-verification and consent mechanisms.
  - s.35: for a solely automated decision with legal or significant effect, rights apply subject to contract, law, or consent exceptions; notify as soon as reasonably practicable; the person may request reconsideration or a new decision not solely automated; consider relevant information and provide written steps/outcome within a reasonable period.
- Data Protection (General) Regulations, 2021 (Kenya Law): https://kenyalaw.org/akn/ke/act/ln/2021/263
  - r.22: notice, meaningful information about logic, significance and consequences, transparency/fairness, error correction and bias controls, human intervention and ability to express point of view.
  - r.49: high-risk includes qualifying automated significant decisions using profiling/algorithms to determine access to services, and processing children’s data; DPIA before such processing.
  - rr.9–12: access within 7 days; rectification within 14 days; written refusal reasons for rectification within 7 days; portability within 30 days and written refusal reasons within 7 days; erasure response within 14 days, subject to exceptions (not an unconditional deletion promise).
- Data Protection (Registration of Data Controllers and Data Processors) Regulations, 2021 (Kenya Law): https://kenyalaw.org/akn/ke/act/ln/2021/265/eng@2022-12-31
  - r.13 and Third Schedule: registration exemption requires both the turnover/revenue and employee thresholds and does not apply to listed purposes including provision of financial services. An application in progress is not a certificate; actual controller/processor role and purpose determine applicability.
- Central Bank of Kenya (Non-Deposit Taking Credit Providers) Regulations, 2026, Legal Notice 191 (Kenya Law): https://kenyalaw.org/akn/ke/act/ln/2026/191/eng@2026-09-29
  - r.3 applies to non-deposit-taking credit business not regulated under another written law; exclusions include registered co-operative societies and licensed SACCOs. Do not assume all Chamas are covered or exempt; identify the real lender/entity/model first.
  - rr.24–25 and 54: in-scope provider must state loan terms, provide loan-agreement copy, and give agreement/repayment schedule/total cost/terms at signing; these rules are conditional on provider scope.
- ODPC 2024 Digital Credit Provider guidance (guidance, not the statute): https://www.odpc.go.ke/wp-content/uploads/2024/02/ODPC-Guidance-Note-for-Digital-Credit-Providers.pdf
  - Discusses notices, lawful basis, children, rights and automated processing for digital lenders; do not use it to classify this Chama/operator absent facts.

## Exact source-code observations

- `chamafork/server.js:2517-2569`: `/api/loans` checks Chama policy, immediately stores `approved` or `rejected`; for approved it calls `applyLoanSchedule` before any disbursement record exists. The message says the app does not transfer/disburse funds.
- `chamafork/server.js:672-677`: `currentBalance` subtracts the full principal of every `approved` or `repaid` loan from transaction income.
- `chamafork/server.js:740-748`: `applyLoanSchedule` calculates total payable and sets loan `outstanding` to that total at approval.
- `chamafork/server.js:717-729` (and subsequent allocation code): approved exposure is used in member principal/guarantor-capacity calculations; approval holds guarantor share-capital capacity.
- `chamafork/server.js:2384-2409`: treasurer may record a cash repayment against any `approved` loan with positive outstanding; records a confirmed cash transaction and reduces outstanding; there is no disbursement confirmation prerequisite.
- `en public/react/src/components/LoansPanel.jsx:417-424`: member-facing schedule is labeled projected and page warns it is not proof of funding.
- `chamafork/server.js:2585-2658` and `en public/react/src/components/LoansPanel.jsx:443-473`: one borrower-requested review; request stored in audit log and published as loan update, but no deadline/escalation or guaranteed reviewer notification. Officer actions are `confirm`, `reassess` (only for rejected; recalculates same saved policy using current records), or `withdraw` (only approved and confirmed no funds disbursed). No explicit independent non-automated outcome for a rejection is available.
- `chamafork/server.js:1592-1615`: login succeeds without policy-version acceptance check.
- `chamafork/server.js:1537-1561`: initial setup validates name/phone/email/PIN and policy choices; no age or guardian-consent input. Project audit also found no age/guardian verification in member activation.

## Current draft status and open facts

- `docs/privacy-policy-draft.md` expressly remains a working draft with placeholders for operator/legal identity, controllers/processors, providers/storage/transfer countries, retention, monitored contact and operational rights requests. s.29 required/optional field and non-provision disclosures need to be made clear at collection.
- Privacy draft rr.9 section currently gives 7-day access, 14-day correction/objection/restriction/erasure response and 30-day portability; it does not state the 7-day written refusal-reason deadline for correction/portability. Avoid saying erasure must always be completed within 14 days.
- Children’s safeguards are unimplemented. If minors are permitted, age verification, parent/guardian consent, best-interests safeguards and a prior DPIA are release gates under DPA s.33/r.49.
- ODPC registration is in progress; approval/certificate or documented exemption is unverified.
- Hosting/provider locations, retention schedule, operator identity, responsible controller(s), support inbox monitoring/response, privacy-request procedure, actual lender/disbursement model, and CBK classification remain unresolved.
- Existing account policy reacceptance is not implemented. This is Eli’s requested product/control requirement. DPA s.29 requires timely notice of relevant processing; law does not automatically establish that every updated privacy notice requires a contract-style reacceptance. Terms acceptance and privacy acknowledgment must remain separate from consent to optional processing.

## Proposed loan-flow recommendation (not implemented)

Keep automatic eligibility as the initial decision; Kenyan DPA s.35 does not automatically require officer pre-approval of every loan. If the decision is a qualifying significant automated decision and no exception applies, the workflow must deliver the right to meaningful reconsideration/new decision not solely automated, with relevant member input considered and written outcome within a reasonable period. Before any real deployment, confirm counsel’s applicability analysis and complete a prior DPIA where r.49 applies.

From: automatic approval immediately writes a funded-style payable/schedule, subtracts the principal from Chama recorded balance and locks guarantor capacity; the app has no actual off-app funding confirmation, but repayment can be recorded.

To: preserve the auto eligibility result as “approved — awaiting disbursement”; record funding separately, with actual lender, principal, date, source/reference and final agreed terms; only then create funded obligation, repayment schedule and repayment eligibility. Decide separately (with counsel/group) whether to reserve funds/guarantor capacity while awaiting funding. This is a record-accuracy/control recommendation, not a claimed statutory rule that approval may never occur before transfer.
