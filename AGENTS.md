# Bookforest development rules

- Product specification is in docs/PRD.md. Ship in verifiable increments.
- Use Korean for user-facing text. Preserve accessible controls and responsive layouts.
- Next.js installed documentation is in node_modules/next/dist/docs. Read the relevant version-matched guide before changing framework behavior.
- Real authentication and data use Supabase. Never silently fall back to fake students or fake success responses when credentials are missing.
- `/studio` is an explicitly labelled, user-requested local playground. Its sample roles and local records never authenticate users, call real classroom mutations, or imply remote saving. Keep these boundaries visible.
- Never expose server secrets, student writing, or feedback in logs or analytics.
- Enforce class membership and consent in database policies and server-side commands.
- Submitted learning versions and contest snapshots are immutable. Draft state is separate.
- All user mutations validate input, use authenticated identities, and check authorization.
- Use idempotency for submission, entry, and rewards; use revision checks for draft writes.
- Add meaningful behavior tests for authorization, deadline, retry, and version transitions.
- Run npm run typecheck, npm test, and npm run build before handoff.
- No changes to unrelated remote projects. Confirm remote account/project selection before writes.
