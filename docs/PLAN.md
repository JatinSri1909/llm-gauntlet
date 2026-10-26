# Plan

This file is the build plan for llm-gauntlet. It lists the goal, the scope, the milestones, the dependencies, and the build parts.

Status: Planned. No part is done yet.

## Goal

Build an open source terminal application for Windows. The application connects the free accounts of one user on many AI platforms. The accounts work as one pool. A decision layer picks one account and one model for each task. The application keeps all data on the local machine.

## Scope

### In scope for version 1

- Windows 10 and Windows 11.
- PowerShell 7 and Windows PowerShell 5.1.
- Interactive mode. The user runs `gauntlet` and types. Slash commands control the application.
- The commands `login`, `logout`, `accounts`, `ask`, `chat`, `usage`, `config`, and `doctor`.
- The mock adapter and the Claude adapter.
- Encrypted session state. The encryption key is protected by Windows DPAPI.
- A local store in SQLite with FTS5 search.
- A decision layer with three difficulty classes: `simple`, `standard`, and `hard`.
- Local usage tracking with a cooling down state.
- A quality check with one escalation.
- A Windows CI workflow on `windows-latest`.

### Out of scope for version 1

- Linux and macOS. Status: Planned. Read `docs/PORTING.md`.
- The ChatGPT, Kimi, DeepSeek, and z.ai adapters. Status: Planned. Each adapter is one later part.
- A background process that keeps the browser open. Status: Planned.
- Embeddings for context search. Status: Planned.
- A full-screen interface built with Ink. Status: Planned. Read part L8.
- Streaming answers. Status: Planned. Read part L9.
- Any method to bypass a CAPTCHA, a rate limit, or a usage limit. This is never in scope.

## Rules for every part

- One part is one logical change. One part is one commit.
- The application builds after each part.
- The tests pass after each part.
- All tests use mock adapters and fake services. No test uses a real account.
- The agent does not run `git commit` or `git push`. The maintainer commits.
- The commit message uses the Conventional Commits format.
- If a part needs more than one commit, stop and split the part.
- If a test fails twice after two fix attempts, stop and ask.
- If a part needs a real account, stop and ask.

## Dependencies

Only the packages in this list are allowed. To add another package, update this file first and get approval.

| Package | Type | Purpose | Added in part |
| --- | --- | --- | --- |
| `typescript` | dev | Compile the code | P01 |
| `tsx` | dev | Run TypeScript files | P01 |
| `@types/node` | dev | Node.js types | P01 |
| `vitest` | dev | Run the tests | P01 |
| `eslint` | dev | Lint | P01 |
| `@eslint/js` | dev | ESLint base rules | P01 |
| `typescript-eslint` | dev | ESLint rules for TypeScript | P01 |
| `prettier` | dev | Format | P01 |
| `commander` | runtime | Parse commands | P04 |
| `zod` | runtime | Check config and API data | P06 |
| `better-sqlite3` | runtime | Fallback only. It is not installed in version 1. The project uses `node:sqlite`. | Not used |
| `playwright` | runtime | Control the browser | P18 |

Rules for dependencies:

- A package that needs a native build is not allowed. `better-sqlite3` is allowed only with a prebuilt Windows binary. If no prebuilt binary exists for the Node.js version, stop and ask.
- The code calls the free classifier API with the Node.js built-in `fetch`. It needs no package.
- Interactive mode uses the Node.js built-in `readline` module and ANSI codes. It needs no package.

## Open items

- **SQLite library (decision D6).** Done. The project uses the built-in `node:sqlite` module. It needs no install and it has FTS5. Read decision D6 in `docs/DECISIONS.md`.
- **Claude adapter page snapshots.** The Claude adapter needs a sanitised snapshot of the Claude web pages to write and test the selectors. The maintainer supplies the snapshots. The snapshots must hold no secret and no personal data.

## Milestones

| Milestone | Parts | Result |
| --- | --- | --- |
| M1 Foundation | P01 to P09 | A project that builds, tests, and runs a CLI shell on Windows CI. Setup scripts work. |
| M2 Storage and security | P10 to P13 | A local database and an encrypted session vault. |
| M3 Providers and login | P14 to P20 | An adapter interface, a mock adapter, the login flow, and the Claude adapter. |
| M4 Context and usage | P21 to P23 | Context storage, context selection, and usage tracking. |
| M5 Decision layer | P24 to P27 | Classification, routing, quality check, and escalation. |
| M6 Commands and release | P28 to P33 | All commands work. Interactive mode works. The docs match the code. |

Version 1 is done when all of these are true:

- `.\setup.ps1` works on a clean Windows 11 machine.
- `npm test` passes on Windows.
- The Windows CI workflow passes.
- No secret appears in the repository or in the logs.

## Build parts

Each part has a name, a goal, the files it touches, a test, and a "done when" check. File names are the planned names. A part can change a file name if the change is small. A big change needs approval.

### M1 Foundation

#### P01 Repository skeleton

- **Goal:** Create the TypeScript project with lint, format, and test tools. Add the npm scripts `build`, `lint`, `format`, and `test`.
- **Files:** `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.js`, `.prettierrc.json`, `.editorconfig`, `.gitignore`, `vitest.config.ts`, `src/index.ts`, `tests/smoke.test.ts`.
- **Test:** `tests/smoke.test.ts` checks that `src/index.ts` exports the application name.
- **Done when:** `npm run build`, `npm run lint`, and `npm test` pass.

#### P02 Line ending rules

- **Goal:** Set the line endings for each file type.
- **Files:** `.gitattributes`, `tests/gitattributes.test.ts`.
- **Test:** The test reads `.gitattributes`. It checks that `*.ps1` and `*.cmd` use CRLF and that `*.ts` and `*.md` use LF.
- **Done when:** `npm test` passes.

#### P03 Windows CI workflow

- **Goal:** Run lint, build, and tests on `windows-latest` for each pull request.
- **Files:** `.github/workflows/ci.yml`.
- **Test:** The workflow runs `npm ci`, `npm run lint`, `npm run build`, and `npm test`.
- **Done when:** The workflow passes on a pull request.

#### P04 CLI shell

- **Goal:** Add the `gauntlet` command with a help text and one stub for each command. Running `gauntlet` with no arguments prints a "Planned" message until part P29.
- **Files:** `package.json`, `src/cli/index.ts`, `src/cli/commands/*.ts`, `tests/cli.test.ts`.
- **Test:** The test runs the CLI with `--help`. It checks that all eight commands are listed. A stub prints a "Planned" message and exits with code 0. The test checks that no arguments call the interactive mode stub.
- **Done when:** `npx tsx src/cli/index.ts --help` lists all commands and `npm test` passes.

#### P05 Logger and errors

- **Goal:** Add a logger that hides secrets and add the typed error classes.
- **Files:** `src/core/logger.ts`, `src/core/errors.ts`, `tests/logger.test.ts`.
- **Test:** The test logs a fake token and a fake key. It checks that neither value appears in the output.
- **Done when:** `npm test` passes.

#### P06 Config loader

- **Goal:** Read and check the config file. Set the default values.
- **Files:** `src/core/config.ts`, `src/core/config-schema.ts`, `tests/config.test.ts`.
- **Test:** The test checks the default values. It checks that a bad value gives a clear error. It checks the `localOnly` option.
- **Done when:** `npm test` passes.

#### P07 Platform interfaces and factory

- **Goal:** Define `KeyStore`, `DataPaths`, and `ShellRunner`. Add the factory that picks the code by `process.platform`.
- **Files:** `src/platform/types.ts`, `src/platform/index.ts`, `src/platform/memory/memory-key-store.ts`, `tests/platform-factory.test.ts`.
- **Test:** The test sets `process.platform` to `linux` and to `darwin`. It checks for a clear "Planned" error. It checks the in-memory `KeyStore` used by tests.
- **Done when:** `npm test` passes. No file outside `src/platform/windows/` calls a Windows API.

#### P08 Windows data paths and safe file code

- **Goal:** Build the data folder path. Write files in a safe way on Windows.
- **Files:** `src/platform/windows/data-paths.ts`, `src/platform/windows/safe-fs.ts`, `tests/safe-fs.test.ts`.
- **Test:** The test checks the path from `%LOCALAPPDATA%` and the fallback. It checks atomic write. It checks retry on `EBUSY` and `EPERM` errors with a fake file system. It checks the long path rule.
- **Done when:** `npm test` passes on Windows.

#### P09 Setup scripts

- **Goal:** Add `setup.ps1` and `setup.cmd`.
- **Files:** `setup.ps1`, `setup.cmd`, `tests/setup.test.ts`.
- **Test:** The test runs `setup.ps1 -CheckOnly`. This mode checks the tools and prints the result. It installs nothing. The test checks that `setup.cmd` passes the execution policy for one run only.
- **Done when:** `.\setup.ps1 -CheckOnly` exits with code 0 and `npm test` passes.

### M2 Storage and security

#### P10 Database layer

- **Goal:** Open the SQLite database. Add the migration runner. Choose the SQLite library.
- **Files:** `src/store/database.ts`, `src/store/migrate.ts`, `docs/DECISIONS.md`, `tests/database.test.ts`.
- **Test:** The test opens a database in a temporary folder. It runs the migrations two times. The second run changes nothing.
- **Done when:** `npm test` passes. `docs/DECISIONS.md` records the library choice.

#### P11 Database schema version 1

- **Goal:** Create the tables for accounts, conversations, messages, summaries, usage records, and settings. Create the FTS5 index for messages.
- **Files:** `src/store/migrations/001-initial.sql`, `tests/schema.test.ts`.
- **Test:** The test creates the schema. It inserts and reads a row in each table. It runs an FTS5 search.
- **Done when:** `npm test` passes. After this part is committed, a schema change needs approval.

#### P12 Windows KeyStore

- **Goal:** Make the Windows `KeyStore`. It wraps the key with DPAPI (current user scope).
- **Files:** `src/platform/windows/dpapi.ps1`, `src/platform/windows/key-store.ts`, `tests/windows-key-store.test.ts`.
- **Test:** The test makes a key, stores it, and reads it back. It checks that the key never appears in the process arguments. The helper works on PowerShell 5.1 and 7.
- **Done when:** `npm test` passes on Windows.

#### P13 Session vault

- **Goal:** Encrypt and decrypt session state with AES-256-GCM. Keep one file for each account.
- **Files:** `src/security/session-vault.ts`, `tests/session-vault.test.ts`.
- **Test:** The test uses the in-memory `KeyStore`. It checks the round trip. It checks that a changed file fails to decrypt. It checks that a wrong key fails to decrypt. It checks that the file holds no plain text.
- **Done when:** `npm test` passes.

### M3 Providers and login

#### P14 Adapter interface and registry

- **Goal:** Define the provider adapter interface and the adapter registry.
- **Files:** `src/providers/types.ts`, `src/providers/registry.ts`, `docs/PROVIDERS.md` (update), `tests/registry.test.ts`.
- **Test:** The test registers two fake adapters. It checks the lookup by name. It checks the error for an unknown name.
- **Done when:** `npm test` passes.

#### P15 Mock adapter

- **Goal:** Make a mock adapter that returns scripted answers, limit messages, CAPTCHA signals, and failures.
- **Files:** `src/providers/mock/mock-adapter.ts`, `tests/mock-adapter.test.ts`.
- **Test:** The test runs each script type and checks the result.
- **Done when:** `npm test` passes.

#### P16 Account manager

- **Goal:** Add, list, and remove accounts. Connect the `accounts` and `logout` commands.
- **Files:** `src/accounts/account-manager.ts`, `src/cli/commands/accounts.ts`, `src/cli/commands/logout.ts`, `tests/account-manager.test.ts`.
- **Test:** The test adds two mock accounts, lists them, and removes one. It checks that `logout` deletes the session file.
- **Done when:** `npm test` passes.

#### P17 Risk notice and consent

- **Goal:** Show the risk notice before the first login. Save the typed confirmation.
- **Files:** `src/cli/risk-notice.ts`, `tests/risk-notice.test.ts`.
- **Test:** The test checks that a wrong answer stops the login. It checks that a correct answer saves the confirmation. It checks that the notice does not show again after confirmation.
- **Done when:** `npm test` passes.

#### P18 Browser launcher

- **Goal:** Start Microsoft Edge first. Use the Playwright Chromium as the fallback. Support visible and headless modes. Hide the launcher behind an interface.
- **Files:** `src/browser/launcher.ts`, `src/browser/types.ts`, `tests/launcher.test.ts`.
- **Test:** The test uses a fake launcher. It checks the Edge-first rule and the fallback rule. It checks that login uses visible mode and all other work uses headless mode.
- **Done when:** `npm test` passes. `npx playwright --version` works.

#### P19 Login flow

- **Goal:** Connect the `login` command. Open the visible browser. Save the session state. Stop on a CAPTCHA.
- **Files:** `src/cli/commands/login.ts`, `src/accounts/login-flow.ts`, `tests/login-flow.test.ts`.
- **Test:** The test uses the mock adapter and the fake launcher. It checks the saved encrypted file. It checks that a CAPTCHA signal stops the flow and shows a message that asks the user to solve it.
- **Done when:** `npm test` passes.

#### P20 Claude adapter

- **Goal:** Make the Claude adapter. It sends a request in headless mode. It detects limit messages and CAPTCHA pages.
- **Files:** `src/providers/claude/claude-adapter.ts`, `src/providers/claude/selectors.ts`, `tests/fixtures/claude/*.html`, `tests/claude-adapter.test.ts`.
- **Test:** The test serves sanitised page snapshots from a local server. It checks the send flow, the answer read, the limit detection, and the CAPTCHA detection.
- **Done when:** `npm test` passes. The maintainer runs one manual check with a real account. This check is not part of the test suite.

### M4 Context and usage

#### P21 Context store

- **Goal:** Save and load conversations, messages, and rolling summaries. Search older messages with FTS5.
- **Files:** `src/context/context-store.ts`, `tests/context-store.test.ts`.
- **Test:** The test saves messages. It loads the last messages. It saves a summary. It finds an old message by keyword.
- **Done when:** `npm test` passes.

#### P22 Context selector

- **Goal:** Build the minimum context for a request. Keep the context inside a size budget.
- **Files:** `src/context/context-selector.ts`, `tests/context-selector.test.ts`.
- **Test:** The test checks that the output holds the system note, the summary, the last messages, and the found snippets. It checks that the output stays inside the budget. It checks that a simple task gets less context.
- **Done when:** `npm test` passes.

#### P23 Usage tracker

- **Goal:** Count requests and tokens for each account in a rolling window. Set the cooling down state when a limit message arrives. Connect the `usage` command.
- **Files:** `src/usage/usage-tracker.ts`, `src/cli/commands/usage.ts`, `tests/usage-tracker.test.ts`.
- **Test:** The test uses a fake clock. It checks the window count. It checks that a limit message sets cooling down until the reset time. It checks that the account becomes ready after that time.
- **Done when:** `npm test` passes.

### M5 Decision layer

#### P24 Local classifier

- **Goal:** Classify a task as `simple`, `standard`, or `hard` with local rules.
- **Files:** `src/decision/local-classifier.ts`, `tests/local-classifier.test.ts`.
- **Test:** The test checks a table of sample prompts and the expected class.
- **Done when:** `npm test` passes.

#### P25 API classifier

- **Goal:** Call a free classifier API (Groq or OpenRouter). Check the JSON answer. Retry once. Fall back to the local classifier. Support the `localOnly` option. Store the API keys in encrypted form.
- **Files:** `src/decision/api-classifier.ts`, `src/decision/classifier.ts`, `src/security/secret-store.ts`, `tests/api-classifier.test.ts`.
- **Test:** The test uses a fake `fetch`. It checks a good answer, a bad JSON answer, a timeout, and an error status. It checks that `localOnly` makes no network call. It checks that the API key never appears in the logs.
- **Done when:** `npm test` passes.

#### P26 Router

- **Goal:** Pick one account and one model from the class, the usage, and the config. Pick the next account when one fails.
- **Files:** `src/decision/router.ts`, `src/decision/model-map.ts`, `tests/router.test.ts`.
- **Test:** The test checks the cheapest model rule. It checks that a cooling down account is skipped. It checks the fallback to the next account. It checks the error when no account is ready.
- **Done when:** `npm test` passes.

#### P27 Quality check and escalation

- **Goal:** Check the answer for an empty text, a cut-off text, and a refusal pattern. Optionally score the answer with the free API. Escalate one class, once.
- **Files:** `src/decision/quality-check.ts`, `src/decision/escalation.ts`, `tests/quality-check.test.ts`.
- **Test:** The test checks each failure type. It checks that escalation happens once and never loops. It checks the warning on the final answer.
- **Done when:** `npm test` passes.

### M6 Commands and release

#### P28 The `ask` command

- **Goal:** Connect all components in the `ask` command.
- **Files:** `src/cli/commands/ask.ts`, `src/app/run-request.ts`, `tests/ask.e2e.test.ts`.
- **Test:** The test runs `ask` with the mock adapter. It checks the class, the account choice, the answer, and the saved records.
- **Done when:** `npm test` passes.

#### P29 Interactive mode shell

- **Goal:** Open a prompt when the user runs `gauntlet` with no arguments or runs `gauntlet chat`. Send each input through the same request runner as `ask`. Show a spinner while a request runs. Keep one conversation for each run.
- **Files:** `src/interactive/shell.ts`, `src/interactive/render.ts`, `src/cli/commands/chat.ts`, `src/cli/index.ts`, `tests/interactive-shell.test.ts`.
- **Test:** The test sends scripted input with the mock adapter. It checks that the second turn uses the saved context. It checks that Ctrl+C and Ctrl+D leave the prompt. It checks that colors and the spinner are off when the output is not a terminal or when `NO_COLOR` is set. It checks that a CAPTCHA signal prints the message and returns to the prompt.
- **Done when:** `npm test` passes. `gauntlet` starts the prompt with the mock adapter.

#### P30 Slash commands and status line

- **Goal:** Treat input that starts with `/` as a slash command. Add `/help`, `/accounts`, `/login`, `/logout`, `/usage`, `/new`, `/resume`, `/verbose`, and `/exit`. Print one status line after each answer. The status line shows the class, the account label, and the model. The slash commands `/config` and `/doctor` come in parts P31 and P32.
- **Files:** `src/interactive/commands/*.ts`, `src/interactive/status-line.ts`, `tests/slash-commands.test.ts`.
- **Test:** The test runs each slash command. It checks that an unknown slash command gives a clear error and sends nothing to a provider. It checks that `/new` starts a new conversation. It checks that `/resume` lists conversations from the local store and loads one. It checks that `/login` runs the login flow and returns to the prompt. It checks the content of the status line.
- **Done when:** `npm test` passes.

#### P31 The `config` command

- **Goal:** Show and change the settings from the terminal. Add the `/config` slash command.
- **Files:** `src/cli/commands/config.ts`, `src/interactive/commands/config.ts`, `tests/config-command.test.ts`.
- **Test:** The test reads a value, sets a value, and sets a bad value. It checks the error for the bad value. It checks that `/config` gives the same results.
- **Done when:** `npm test` passes.

#### P32 The `doctor` command

- **Goal:** Check Node.js, the browser, the data folder, the key store, and the database. Add the `/doctor` slash command.
- **Files:** `src/cli/commands/doctor.ts`, `src/doctor/checks.ts`, `src/interactive/commands/doctor.ts`, `tests/doctor.test.ts`.
- **Test:** The test runs each check with a fake environment. It checks a pass and a fail for each check. It checks that `/doctor` runs the same checks.
- **Done when:** `npm test` passes. `gauntlet doctor` runs on Windows.

#### P33 Documentation sync

- **Goal:** Change the status marks in the docs from "Planned" to "Done" for each finished feature. Check all PowerShell commands in the docs.
- **Files:** `README.md`, `docs/*.md`, `AGENTS.md`.
- **Test:** A test checks that each command in the README exists in the CLI help.
- **Done when:** `npm test` passes. Each doc matches the code.

## Parts after version 1

All of these are Planned. Each one needs approval before work starts.

| Part | Name | Goal |
| --- | --- | --- |
| L1 | ChatGPT adapter | Add a ChatGPT adapter. |
| L2 | Kimi adapter | Add a Kimi adapter. |
| L3 | DeepSeek adapter | Add a DeepSeek adapter. |
| L4 | z.ai adapter | Add a z.ai adapter. |
| L5 | Background process | Keep the browser open between requests. |
| L6 | Linux port | Add the Linux `KeyStore` and paths. Read `docs/PORTING.md`. |
| L7 | macOS port | Add the macOS `KeyStore` and paths. Read `docs/PORTING.md`. |
| L8 | Ink interface | Replace the plain prompt with a full-screen interface built with Ink. This adds the packages `ink` and `react`. |
| L9 | Streaming answers | Print the answer while the provider writes it. Each adapter needs extra code. |