# Project instructions

This is a PayPal AI Hackathon prototype for renters worldwide, starting with a German-language EUR electricity statement.

- Read `README.md` before editing.
- Use `package.json` and its lockfile as the source of installed versions.
- Preserve deterministic money calculations, bill versions, and server-verified payment states.
- Distinguish planned features from implemented ones. Never commit real bills or personal and bank details; use synthetic statements in the repository. Label simulated supplements and preserve original evidence.
- Keep secrets server-side and out of source control.
- Run checks appropriate to the change and report actual results.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
