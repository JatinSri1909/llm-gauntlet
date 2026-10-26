# llm-gauntlet

llm-gauntlet is an open source terminal application for Windows. It connects the free accounts of one user on many AI platforms. The accounts work as one pool. A decision layer picks the right account and the right model for each task.

> **Status:** Planning is complete. The code does not exist yet. Every feature in this file is marked "Planned" until the build part for that feature is done. Read `docs/PLAN.md` for the build order.

## Purpose

Students often have many free accounts on AI platforms. Most tasks do not need a frontier model. A free-tier model can do the task.

llm-gauntlet helps the student use these accounts well. It does these steps:

1. It reads the task.
2. It decides how difficult the task is.
3. It checks the usage that is left in each account.
4. It picks one account and one model.
5. It sends only the context that the task needs.
6. It returns the answer to the terminal.

The application keeps all data on the local machine.

## Features

All features are Planned.

| Feature | Status |
| --- | --- |
| Sign in to an account in a visible browser window | Planned |
| Encrypted storage of session state | Planned |
| Task classification in three classes: `simple`, `standard`, `hard` | Planned |
| Account and model selection by the decision layer | Planned |
| Local usage tracking for each account | Planned |
| Local store of conversations, summaries, and usage records | Planned |
| Minimum context selection for each request | Planned |
| Answer quality check and one-time escalation | Planned |
| Claude adapter | Built in part P20. The manual check with a real account is Pending. |
| ChatGPT adapter | Planned |
| Kimi adapter | Planned |
| DeepSeek adapter | Planned |
| z.ai adapter | Planned |
| Interactive mode with a prompt and slash commands | Planned |
| Full-screen interface built with Ink | Planned |
| Streaming answers | Planned |
| `gauntlet doctor` self check | Planned |

## Platform support

| Platform | Status |
| --- | --- |
| Windows 10 | Planned for version 1 |
| Windows 11 | Planned for version 1 |
| Linux | Planned |
| macOS | Planned |

Version 1 supports Windows only. Read `docs/PORTING.md` for the port plan.

## Requirements

- Windows 10 or Windows 11.
- PowerShell 7 or Windows PowerShell 5.1.
- Node.js (current LTS version).
- Git.
- One or more free accounts on a supported AI platform.

If a requirement is missing, `setup.ps1` tells you. It asks before it installs anything.

## Quick start

All steps use PowerShell. This section describes the planned setup.

1. Clone the repository.

   ```powershell
   git clone https://github.com/JatinSri1909/llm-gauntlet.git
   cd llm-gauntlet
   ```

2. Run the setup script.

   ```powershell
   .\setup.ps1
   ```

   If PowerShell blocks the script, run the wrapper instead. The wrapper changes the execution policy for that one run only. It does not change the policy of your machine.

   ```powershell
   .\setup.cmd
   ```

3. Sign in to one account. A visible browser window opens. Sign in as you normally do.

   ```powershell
   gauntlet login claude
   ```

4. Start interactive mode.

   ```powershell
   gauntlet
   ```

   A prompt opens. Type your task and press Enter. Type `/help` to see the slash commands. Type `/exit` to leave.

5. To ask one question without interactive mode, use `ask`. This is useful in scripts.

   ```powershell
   gauntlet ask "Explain the difference between a process and a thread."
   ```

## What setup does

The setup script does these steps:

1. It checks for Node.js, npm, and Git.
2. It asks before it runs `winget install` for a missing tool.
3. It installs the dependencies with `npm ci`.
4. It installs the Playwright browsers.
5. It creates the local data folder.

The setup script does not change any system setting. It does not change the registry. It does not change a machine-wide policy.

## Usage

All commands are Planned.

| Command | Purpose |
| --- | --- |
| `gauntlet` | Start interactive mode. |
| `gauntlet login <provider>` | Open a visible browser. Sign in. Save the encrypted session state. |
| `gauntlet logout <provider>` | Delete the saved session state of one account. |
| `gauntlet accounts` | List the accounts and their status. |
| `gauntlet ask "<text>"` | Send one request. Print the answer. Use it in scripts. |
| `gauntlet chat` | Start interactive mode. Same as `gauntlet`. |
| `gauntlet usage` | Show the local usage records. |
| `gauntlet config` | Show or change the settings. |
| `gauntlet doctor` | Check Node.js, the browser, the data folder, and the key store. |

### Interactive mode

Run `gauntlet` with no arguments. A prompt opens. You type a task, and the application sends it through the decision layer. You do not type `gauntlet ask` each time.

After each answer, interactive mode prints one status line. The line shows the class, the account label, and the model.

Input that starts with `/` is a slash command. All other input is a task. All slash commands are Planned.

| Slash command | Purpose |
| --- | --- |
| `/help` | Show the slash commands. |
| `/accounts` | List the accounts and their status. |
| `/login <provider>` | Sign in to an account. A visible browser opens. |
| `/logout <provider>` | Delete the saved session state of one account. |
| `/usage` | Show the local usage records. |
| `/config` | Show or change the settings. |
| `/doctor` | Run the self checks. |
| `/new` | Start a new conversation. |
| `/resume` | Continue an earlier conversation from the local store. |
| `/verbose` | Show or hide the detail of the routing choice. |
| `/exit` | Leave interactive mode. |

Interactive mode shows a spinner while a request runs. It prints the whole answer when the answer arrives. Streaming answers and a full-screen interface are Planned.

## How it works

For each request, the decision layer does these steps:

1. It classifies the task as `simple`, `standard`, or `hard`.
2. It reads the usage records. It skips an account that is cooling down.
3. It picks the cheapest model that fits the class.
4. It reads the local store. It selects the minimum context.
5. It starts a headless browser. It loads the saved session state.
6. It opens a new chat on the provider site. It sends the request.
7. It checks the answer. If the check fails, it tries one class higher, once.
8. It prints the answer and saves the result in the local store.

Read `docs/ARCHITECTURE.md` for more detail.

## Data and privacy

- The application stores all data in `%LOCALAPPDATA%\llm-gauntlet`.
- The application stores session state only. It never stores passwords.
- The application encrypts session state with AES-256-GCM.
- Windows DPAPI protects the encryption key.
- The application never writes a secret to a log, a prompt, or a commit.
- The decision layer can use a free API (Groq or OpenRouter) to classify a task. That API receives the truncated text of your prompt. The first run shows a notice about this. To stop it, set the `localOnly` option. The application then uses local rules only.

Read `docs/SECURITY.md` for more detail.

## Risk

Read this section before you sign in to an account.

- **Platform terms can forbid automated access.** Many AI platforms do not allow a program to use their web interface. Read the terms of each platform before you use llm-gauntlet with it.
- **An account can be suspended.** A platform can limit, suspend, or close an account that it thinks is automated. You can lose access to the account and to its history.
- **You accept this risk.** The first `gauntlet login` shows a notice. You must type a confirmation before the login starts.
- **llm-gauntlet reduces the risk but does not remove it.** It sends one request at a time to each account. It waits a minimum time between requests. It adds no tool to hide the automation.
- **llm-gauntlet never bypasses a control.** It does not bypass a CAPTCHA. It does not bypass a rate limit. It does not bypass a usage limit. If a CAPTCHA appears, the application stops. You must solve it in the visible window.
- **Use accounts that you can afford to lose.** Do not use an account that holds work you cannot replace.

The authors give no warranty. The authors are not responsible for a lost or suspended account.

## Documentation

| File | Content |
| --- | --- |
| `docs/PLAN.md` | Goal, scope, milestones, and build parts |
| `docs/ARCHITECTURE.md` | Components and data flow |
| `docs/DECISIONS.md` | Decision records |
| `docs/PROVIDERS.md` | How to write a provider adapter |
| `docs/SECURITY.md` | Session protection and vulnerability reports |
| `docs/PORTING.md` | Plan for Linux and macOS (Planned) |
| `CONTRIBUTING.md` | How to contribute |
| `CONVENTIONS.md` | Code style and rules |
| `AGENTS.md` | Rules for AI coding agents |

## Licence

llm-gauntlet uses the MIT licence. Read `LICENSE`.