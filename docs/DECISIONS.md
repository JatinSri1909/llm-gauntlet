# Decisions

This file holds one record for each decision made in Stage 1 (planning). Each record has an ID, a status, the decision, the reason, and the options that the project did not choose.

Status: Planned. The code does not exist yet.

## Rules for this file

- Each decision has a fixed ID. Do not reuse an ID.
- All decisions below have the status "Accepted" and the date 2026-10-26, unless a record says otherwise.
- To change a decision, add a new record that replaces the old record. Set the old record to "Replaced by D<number>". Do not delete a record.
- A change to a decision needs approval from the maintainer.
- Part P10 resolved decision D6. It records the SQLite library choice.

## Index

| ID | Topic |
| --- | --- |
| D1 | Project name, command, and licence |
| D2 | Platform scope |
| D3 | Language and runtime |
| D4 | Setup scripts |
| D5 | Data folder |
| D6 | SQLite library |
| D7 | Platform layer |
| D8 | Login method and browser |
| D9 | Session state storage |
| D10 | Key storage |
| D11 | Security limits |
| D12 | Risk notice and request pace |
| D13 | Local store |
| D14 | Context selection |
| D15 | Provider chat for each request |
| D16 | Task classifier |
| D17 | Difficulty classes and model map |
| D18 | Usage tracking |
| D19 | Quality check and escalation |
| D20 | Providers in version 1 |
| D21 | Browser process model |
| D22 | Commands |
| D23 | Contributor workflow |
| D24 | Tools and tests |
| D25 | Interactive mode as the main interface |
| D26 | Interface style |
| D27 | Slash commands and status line |
| D28 | Conversations in interactive mode |
| D29 | Answer display |

## D1 Project name, command, and licence

- **Status:** Accepted.
- **Decision:** The repository is `llm-gauntlet`. The command is `gauntlet`. The licence is MIT. The GitHub owner is `JatinSri1909`.
- **Reason:** The spelling "gauntlet" is the correct word. The first spec used "gautlet" by mistake. A rename after the docs exist changes every file. MIT is short and well known.
- **Options not chosen:** Apache-2.0. It has a patent grant, but it is longer.

## D2 Platform scope

- **Status:** Accepted.
- **Decision:** Version 1 supports Windows 10 and Windows 11 only. The shells are PowerShell 7 and Windows PowerShell 5.1. Linux and macOS are "Planned".
- **Reason:** The maintainer develops on Windows. One platform keeps version 1 small.
- **Options not chosen:** Support all three platforms in version 1.

## D3 Language and runtime

- **Status:** Accepted.
- **Decision:** The project uses TypeScript on the current Node.js LTS version.
- **Reason:** Playwright has first-class support for Node.js. The spec already uses the Node.js `path` module.
- **Options not chosen:** Python. Its browser tools are good, but the project spec points to Node.js.

## D4 Setup scripts

- **Status:** Accepted.
- **Decision:** `setup.ps1` checks for Node.js, npm, and Git. If a tool is missing, it prints the `winget install` command and asks before it runs the command. Then it runs `npm ci`, installs the Playwright browsers, and creates the data folder. `setup.cmd` calls `setup.ps1` and sets the execution policy for that one run only.
- **Reason:** The script never changes the machine without the consent of the user. The script never changes a machine-wide policy.
- **Options not chosen:** Install every tool without a question.

## D5 Data folder

- **Status:** Accepted.
- **Decision:** The data folder is `%LOCALAPPDATA%\llm-gauntlet`. The code reads `process.env.LOCALAPPDATA`. If the variable is missing, the code uses `os.homedir()`.
- **Reason:** `%APPDATA%` can roam between machines. DPAPI keys do not roam. Encrypted sessions would break on another machine.
- **Options not chosen:** `%APPDATA%`. `os.homedir()` as the first choice.

## D6 SQLite library

- **Status:** Accepted. Part P10 resolved this decision on 2026-10-26.
- **Decision:** The project uses the built-in `node:sqlite` module. The module needs no install and no native build. The Node.js version in use is 24.21.0. It loads `node:sqlite` without a flag. Its SQLite build is 3.53.4. It has the FTS5 extension that part P11 needs. The store code uses only a small part of the API.
- **Reason:** The project asked for a library that installs on Windows without Visual Studio Build Tools. The built-in module needs nothing. It also removes a dependency. The `engines` field of `package.json` now asks for Node.js 24 or newer, because the module needs a newer Node.js version without a flag.
- **Limit:** `node:sqlite` has release candidate status in Node.js. The Node.js docs say "Stability: 1.2 - Release candidate" since Node.js 24.15.0. The API can change in a later release. The store code sits behind a small class. A later version can add a `better-sqlite3` implementation without a change in the other folders.
- **Options not chosen:** `better-sqlite3`. Its API is stable, but it needs a prebuilt binary for each Node.js version. A missing prebuilt binary needs a native build.

## D7 Platform layer

- **Status:** Accepted.
- **Decision:** The folder `src/platform/` holds the interfaces `KeyStore`, `DataPaths`, and `ShellRunner`. All Windows code is in `src/platform/windows/`. A factory picks the code from `process.platform`. On Linux and macOS, the factory throws an error that says the platform is "Planned".
- **Reason:** A later port adds a new folder and a new factory case. It changes no other code.
- **Options not chosen:** Windows calls in the other folders.

## D8 Login method and browser

- **Status:** Accepted.
- **Decision:** Login opens a visible browser. The user signs in. The browser is Microsoft Edge (`channel: "msedge"`). If Edge is not available, the project uses the Playwright Chromium.
- **Reason:** Edge is on every Windows 10 and Windows 11 machine. Setup then downloads less.
- **Options not chosen:** Store passwords and sign in with a script. The project never stores passwords.

## D9 Session state storage

- **Status:** Accepted.
- **Decision:** The application saves the Playwright `storageState` of each account as one JSON blob. It encrypts the blob with AES-256-GCM. It keeps one encrypted file for each account.
- **Reason:** One blob is easy to encrypt and easy to delete.
- **Options not chosen:** Store the state in the database. Encrypt each cookie.

## D10 Key storage

- **Status:** Accepted.
- **Decision:** The application makes one random 32-byte key on the first run. DPAPI (current user scope) wraps the key. The wrapped key is in the data folder. A PowerShell helper in `src/platform/windows/` does the wrap and the unwrap. The key goes through stdin and never through an argument. The helper works on PowerShell 5.1 and 7. All of this is behind the `KeyStore` interface.
- **Reason:** DPAPI needs no native module. A later port adds a new `KeyStore` class.
- **Options not chosen:** Windows Credential Manager. A native module for DPAPI.

## D11 Security limits

- **Status:** Accepted.
- **Decision:** The application never stores passwords. It never writes a secret to a log, a prompt, or a commit. It never bypasses a CAPTCHA, a rate limit, or a usage limit. If a CAPTCHA appears, the application stops and asks the user to solve it in a visible window.
- **Reason:** These rules come from the project constraints. They keep the project inside what the platforms allow the user to do by hand.
- **Options not chosen:** None. These rules do not change.

## D12 Risk notice and request pace

- **Status:** Accepted.
- **Decision:** The first run of `gauntlet login` shows a risk notice. The user must type a confirmation before the login starts. The application saves the confirmation on the local machine. The application sends one request at a time to each account, with a minimum delay between requests. The project has no stealth or anti-detection tools. The docs say that platform terms can forbid automated access and that an account can be suspended.
- **Reason:** The user makes an informed choice. The code does nothing to hide the automation.
- **Options not chosen:** No notice. Stealth tools that hide the automation.

## D13 Local store

- **Status:** Accepted.
- **Decision:** The local store is one SQLite database. It holds conversations, messages, rolling summaries, usage records, and settings. It has an FTS5 index of the message text.
- **Reason:** One local file keeps all data on the machine. FTS5 needs no extra download.
- **Options not chosen:** A separate database server. JSON files.

## D14 Context selection

- **Status:** Accepted.
- **Decision:** For each request, the application sends the system note, the summary, the last few messages, and a few older snippets from FTS5 keyword search. Version 1 has no embeddings. The context stays inside a size budget.
- **Reason:** FTS5 needs no model download. A small context uses less of the free usage of each account.
- **Options not chosen:** Embeddings. They are "Planned".

## D15 Provider chat for each request

- **Status:** Accepted.
- **Decision:** The application does not continue a thread on the provider side. For each request, it opens a new provider chat and sends the selected context from the local store.
- **Reason:** The decision layer controls the context. The next turn can go to a different account.
- **Options not chosen:** Keep one provider chat for each conversation.

## D16 Task classifier

- **Status:** Accepted.
- **Decision:** A free API model (Groq or OpenRouter) classifies the task and returns JSON. It receives only the truncated prompt text. If the API fails, times out, or returns bad JSON, the code retries once and then uses the local classifier. The config option `localOnly` turns the API off. The first run shows a notice that the prompt text goes to the free API. The API keys are stored in encrypted form.
- **Reason:** The router never waits on one free service. The user knows what leaves the machine.
- **Options not chosen:** Use only local rules. Send the full history to the API.

## D17 Difficulty classes and model map

- **Status:** Accepted.
- **Decision:** There are three classes: `simple`, `standard`, and `hard`. A config file maps each class to a model for each provider. The router picks the cheapest model that fits the class.
- **Reason:** Three classes are easy to test and easy for contributors to extend.
- **Options not chosen:** A numeric score. More than three classes.

## D18 Usage tracking

- **Status:** Accepted.
- **Decision:** The application counts requests and tokens for each account in a rolling window in the local database. When a site shows a limit message, the adapter reports it. The account goes into the cooling down state until the stated reset time. The application never calls hidden endpoints to read quotas. It never tries to get around a limit.
- **Reason:** Free web accounts have no official usage API. The project constraints forbid bypassing limits.
- **Options not chosen:** Read quotas from hidden endpoints.

## D19 Quality check and escalation

- **Status:** Accepted.
- **Decision:** Local checks look for an empty answer, a cut-off answer, and a refusal pattern. For `standard` and `hard` tasks, the classifier API can also score the answer. A failed check escalates the task one class, once. After the second failure, the application returns the best answer with a warning.
- **Reason:** The check costs little. Escalation cannot loop.
- **Options not chosen:** Escalate until a check passes.

## D20 Providers in version 1

- **Status:** Accepted.
- **Decision:** Version 1 ships the mock adapter and the Claude adapter. The ChatGPT, Kimi, DeepSeek, and z.ai adapters come one at a time later. Each stays "Planned" until it exists.
- **Reason:** Provider web pages change often. One real adapter proves that the adapter interface works.
- **Options not chosen:** All five adapters in version 1.

## D21 Browser process model

- **Status:** Accepted.
- **Decision:** The application starts a headless browser for each request. It loads the saved session state and closes the browser when the answer arrives. Version 1 has no background process. A background process is "Planned".
- **Reason:** It is simple and it leaves no hidden process. The cost is a start-up delay of a few seconds.
- **Options not chosen:** A background process that keeps the browser open.

## D22 Commands

- **Status:** Accepted.
- **Decision:** The commands are `login`, `logout`, `accounts`, `ask`, `chat`, `usage`, `config`, and `doctor`. Running `gauntlet` with no arguments starts interactive mode (decision D25).
- **Reason:** `doctor` helps users and contributors find Windows problems fast.
- **Options not chosen:** None.

## D23 Contributor workflow

- **Status:** Accepted.
- **Decision:** The project uses Conventional Commits. Contributors fork the repository and work on a feature branch. Each build part is one pull request. The project uses squash merge, one review, and a green Windows CI run before merge. The maintainer makes the commits for build parts. The agent never runs `git commit` or `git push`.
- **Reason:** One small pull request for each part keeps reviews short.
- **Options not chosen:** Large pull requests that hold many parts.

## D24 Tools and tests

- **Status:** Accepted.
- **Decision:** The project uses ESLint, Prettier, and Vitest. All tests use mock adapters and fake services. No test uses a real account. A GitHub Actions workflow runs the checks on `windows-latest`.
- **Reason:** Tests must run for every contributor without an account. The CI runs on the target platform.
- **Options not chosen:** Tests against real provider sites.

## D25 Interactive mode as the main interface

- **Status:** Accepted.
- **Decision:** `gauntlet` with no arguments opens interactive mode. The user types a task and does not type `gauntlet ask` each time. `gauntlet chat` is an alias. `gauntlet ask` stays as a one-shot command for scripts and pipes. Both ways use the same request runner.
- **Reason:** This is how Claude Code and Codex work. Scripts still have a plain command.
- **Options not chosen:** Keep `ask` as the only way to send a task.

## D26 Interface style

- **Status:** Accepted.
- **Decision:** Version 1 uses a plain terminal session built with the Node.js `readline` module and ANSI codes. It has a prompt, colors, and a spinner. It adds no package. A full-screen interface built with Ink is "Planned" (part L8). Colors and the spinner are off when the output is not a terminal or when `NO_COLOR` is set.
- **Reason:** Windows consoles differ in colors and cursor moves. PowerShell 5.1 in the old console is the weakest case. A plain session works everywhere and ships sooner.
- **Options not chosen:** Ink in version 1. It adds the `ink` and `react` packages and needs tests on both PowerShell versions.

## D27 Slash commands and status line

- **Status:** Accepted.
- **Decision:** Input that starts with `/` is a slash command. The commands are `/help`, `/accounts`, `/login <provider>`, `/logout <provider>`, `/usage`, `/config`, `/doctor`, `/new`, `/resume`, `/verbose`, and `/exit`. After each answer, the session prints one status line with the class, the account label, and the model. `/verbose` shows more detail about the routing choice. An unknown slash command gives an error and sends nothing to a provider.
- **Reason:** The user can do everything without leaving the session. The user sees which account answered.
- **Options not chosen:** Run application commands only from the shell.

## D28 Conversations in interactive mode

- **Status:** Accepted.
- **Decision:** Interactive mode keeps one conversation for each run. `/new` starts a new conversation. `/resume` lists past conversations from the local store and continues one.
- **Reason:** The local store already holds conversations and summaries. No new storage is needed.
- **Options not chosen:** Always continue the last conversation.

## D29 Answer display

- **Status:** Accepted.
- **Decision:** Version 1 shows a spinner and prints the whole answer when it arrives. Streaming answers are "Planned" (part L9).
- **Reason:** Reading partial text from a provider page is fragile. Each adapter would need extra code.
- **Options not chosen:** Streaming in version 1.