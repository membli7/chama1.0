# Imported Jirani Chama support skill — source notes

Upstream source: https://raw.githubusercontent.com/membli7/jiraniskill/main/SKILL.md
Repository: https://github.com/membli7/jiraniskill

The upstream skill was fetched in full. The project copy at `chamafork/skills/jirani-chama-support/SKILL.md` preserves its instructions and the confirmed usual 5–7-working-day reply estimate, with the skill slug and product references changed from Jirani Channel to Jirani Chama as requested.

The Jirani Chama app's live support assistant is deterministic (no external LLM), implemented in `chamafork/support-service.js` and `en public/react/src/components/AiSupportBubble.jsx`; the app's approved product facts remain in `chamafork/support-knowledge.md` and server behavior. The existing contact endpoint sends through the configured backend and only returns success after its email transport accepts the message.
