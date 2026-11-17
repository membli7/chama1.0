# External research — passkey implementation

## Selected WebAuthn library

`@passwordless-id/webauthn` package page reports v2.4.1, MIT license, Node.js 19+, no runtime dependencies, and publication about one month before the current task. It exports browser `client` and server `server` modules. Sources: [npm package](https://www.npmjs.com/package/@passwordless-id/webauthn), [official docs](https://webauthn.passwordless.id/), [upstream source repo](https://github.com/passwordless-id/webauthn).

The official registration docs show `client.register({user, challenge, userVerification: 'required', discoverable: 'required', hints: ['client-device'], domain, attestation: false})`; server-side `verifyRegistration(registration, {challenge, origin, userVerified: true, domain})`; and parsed credential fields including ID, public key, algorithm, transports, and user. Docs say attestation itself is not verified by the library, so implementation should not request/store attestation or rely on device model claims. Source: [registration docs](https://webauthn.passwordless.id/registration/).

The official authentication docs say `server.randomChallenge()` generates a random base64url challenge, which should be stored server-side for a limited time and consumed once; omitting allowed credential IDs triggers native passkey selection (discoverable credentials); client authentication can require user verification; server verifies challenge, origin, domain, user verification, signature, and optional counter. Counter behavior must allow zero for synced passkeys but reject a nonzero counter that fails to advance. Source: [authentication docs](https://webauthn.passwordless.id/authentication/).

## Compatibility comparison

Current SimpleWebAuthn docs (14.1.x) require Node LTS 22+, while the project advertises Node 20.19+. SimpleWebAuthn 13.3 supports Node 20 but is explicitly marked no longer actively maintained. Sources: [current server docs](https://simplewebauthn.dev/docs/packages/server), [v13.3 server docs](https://simplewebauthn.dev/docs/13.3.x/packages/server).

## Persistence finding

Project PostgreSQL migration `chamafork/db/002_app_tables.sql` provides `users.record_data JSONB`; `chamafork/repo/postgres-state.js` serializes the full user record into it and restores it on load. Optional passkey metadata can therefore be stored in the existing user object without schema/data migration. The JSON backend likewise persists full user objects.

## Upstream verification-source review

The current upstream `src/server.ts` explicitly checks the RP-ID hash, WebAuthn ceremony type, exact expected origin/challenge, user presence, required user-verification flag, credential-ID match, and cryptographic assertion signature. It supports ES256 and RS256 signatures; its browser client advertises those algorithms. The library's built-in counter check treats a previous nonzero counter as requiring a higher counter, but that implementation would reject a later zero. The app will therefore verify the signature without passing the counter to the library and apply the WebAuthn clone-detection rule itself: reject only when both old and new counters are nonzero and the new value does not increase; accept zero counters used by synced passkeys and never lower a previously stored counter. Sources: [server implementation](https://raw.githubusercontent.com/passwordless-id/webauthn/main/src/server.ts), [client implementation](https://raw.githubusercontent.com/passwordless-id/webauthn/main/src/client.ts), [parsers](https://raw.githubusercontent.com/passwordless-id/webauthn/main/src/parsers.ts), [upstream server tests](https://raw.githubusercontent.com/passwordless-id/webauthn/main/src/__test__/server.test.ts).

The browser helper calls `console.debug` with public ceremony options and WebAuthn result objects; the UI will suppress those debug calls only while invoking the helper, and no private key or biometric is exposed to the server. Browser results include the authenticator's `userHandle` as base64url-encoded bytes; the app will compare it with the server-generated opaque per-account handle.


## WebAuthn RP ID and local HTTP origin

Source: [W3C WebAuthn Level 3 RP ID section](https://www.w3.org/TR/webauthn-3/#rp-id). The RP ID must equal the origin's effective domain or be a registrable-domain suffix; the origin must be HTTPS except that HTTP is allowed when the host is exactly `localhost`. IP-address hosts are not valid RP ID domain strings. The implementation therefore accepts local HTTP only on `localhost` and requires HTTPS for deployed origins.

## User-handle encoding verified against installed v2.4.1 client

The installed browser client passes `user.id` through `utils.toBuffer`, which copies ASCII character codes into authenticator user-handle bytes. Server-generated base64url handles are ASCII, so the stored opaque handle matches those bytes exactly; the client returns the response handle as base64url-encoded bytes. Source files: `chamafork/node_modules/@passwordless-id/webauthn/dist/esm/client.js` and `utils.js`.
