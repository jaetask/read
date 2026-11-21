# AGENTS.md

Read: files read aloud together, an App on [@jaetask/open-agent-kit](https://github.com/jaetask/open-agent-kit). TypeScript, Node 22.19+, ESM, built with tsc. Read [README.md](README.md) first.

- **Language**: use the words in [GLOSSARY.md](GLOSSARY.md), never their _Avoid_ synonyms. The Kit's own words (App, Domain, Action, Effect, Call, Outcome, Contract, Connection) keep the meaning its glossary gives them.
- **Every caller goes through the Call pipeline**: the page, voice commands, the agent and other Apps change the reader only by invoking Actions. Nothing personal is in code: the files, the voice and the model come from the environment.
- **Reading commands are resolved before any model**: `parseCommand` and `parseOpen` in `src/files/commands.ts`. A question goes to the agent.
- **The page** is in `page/`, built from [@jaetask/toolkit](https://github.com/jaetask/toolkit). Buttons are icons with a label for screen readers; white space shows the hierarchy; no focus rings; no raw form controls. `toolkit-guard` (part of `lint`) enforces the last two.
- **Build only what has a reason**: leave a part out unless there is a deliberate reason for it.
- **Proofs**: `npm test` (unit tests) and expect tests in `expect/`: `npm run expect -- --update`, then read every new `.expect.md` before committing.
- **Checks**: `npm run typecheck`, `lint`, `format:check`, `test`, `expect`, `build`. Hooks in `.agents/guardrails/hooks` run them on commit and push; `npm run format` fixes formatting.
- **No code comments**: code is law. Say it in the code, a name or a test; a decision goes in `docs/adr`. `check:comments` (part of `lint`) fails any new comment; the delete-comment skill removes them.
- **Branches**: push a branch, never main. `auto-pr` opens a pull request to main and it merges itself when the `ci` check passes; the pre-push hook refuses main.
- **Public docs state decisions only**, in plain, literal language. `npm run check:docs` (part of `lint`) enforces it; when someone flags a new phrase, add it to `scripts/docs-phrases.json` with the pave skill.
- Log friction and decisions with the trail skill. When corrected, or when the same friction repeats, use the pave skill.
