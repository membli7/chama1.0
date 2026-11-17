# Daraja integration notes (working file)

## Official Safaricom sources checked

- [Daraja Getting Started](https://developer.safaricom.co.ke/apis/GettingStarted): Safaricom documents REST/JSON APIs, callback/ResultURL delivery, and recommends whitelisting the listed API Gateway callback IP addresses. It says callbacks are asynchronous; if the server is unavailable, the gateway logs 503 and discards results. It also describes security credentials for transaction-status/reversal-type APIs as RSA-encrypted using the environment-specific M-PESA certificate (PKCS#1 v1.5, then Base64).
- [Daraja Authorization](https://developer.safaricom.co.ke/apis/Authorization): OAuth client-credentials access token via HTTP Basic auth; token lifetime about 3600 seconds. Use environment-specific app credentials; never expose these values.
- [Daraja M-PESA Express Simulate](https://developer.safaricom.co.ke/apis/MpesaExpressSimulate): the portal page states a network-initiated push is sent to the customer's registered number, so do not call it in this verification-only task.
- [Daraja Transaction Status](https://developer.safaricom.co.ke/apis/TransactionStatus): official API exists; the page's searchable result describes it as secondary reconciliation when callbacks are not received, while the extracted page itself is only a shell.
- [Daraja Pull Transaction](https://developer.safaricom.co.ke/apis/PullTransaction): official API exists; the searchable result describes it as reconciliation for C2B transactions. Extracted page is only a shell.
- [Daraja portal](https://developer.safaricom.co.ke/): describes sandbox apps for simulated testing and provides access to API references.

## Integration constraints

- Current project configuration mode was checked safely as `sandbox`; the existing `.env` credential/URL values were not printed. Source code does not currently consume those M-PESA variables.
- No provider request, payment prompt, charge, or disbursement was sent. Tests must mock provider calls and use dummy test values; do not use `.env` credentials in automated tests.
- Subscription activation must still require a pending server-created plan/reference, exact tier amount in KES, matching tenant/account reference, verified provider transaction, and deduplication by M-PESA receipt/transaction ID. Never activate from raw unverified callback JSON alone.
- The official docs page extraction is incomplete for detailed Transaction Status request/response schemas; consult exact Daraja app/API documentation or require missing sandbox configuration rather than guessing.
