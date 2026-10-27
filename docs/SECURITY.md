# Security

This file explains how llm-gauntlet protects sessions and other data. It also explains how to report a vulnerability.

Status: Version 1 is built for Windows. This file describes the protections. A protection marked "Planned" is not built yet. Read `docs/PLAN.md` for the build order.

## Report a vulnerability

Do not open a public issue for a vulnerability. A public issue tells attackers before a fix exists.

1. Open the page `https://github.com/JatinSri1909/llm-gauntlet/security/advisories/new`.
2. Write a clear title.
3. Describe the problem. Include these items:
   - The version or the commit.
   - The Windows version and the PowerShell version.
   - The steps to repeat the problem.
   - What an attacker can do.
   - Your idea for a fix, if you have one.
4. Do not attach a real session file, a real key, a real cookie, or a real token. Use fake values.
5. Send the report.

The maintainer plans to do these steps:

- Confirm the report within 7 days.
- Tell you if the report is valid.
- Make a fix and publish it.
- Give you credit in the release notes, if you want it.

Please give the maintainer time to publish a fix before you tell other people. The maintainer asks for 90 days at most.

If the private reporting page is not available, open a public issue that says only "I need to report a security problem." Do not put any detail in that issue. The maintainer will give you a private way to send the report.

## Supported versions

| Version | Status |
| --- | --- |
| Version 1 (after release) | Planned. The latest release gets security fixes. |
| Older versions | Planned. They do not get security fixes. |

## Scope

### In scope

- Theft of session state or keys by another program or another Windows user.
- Plain text secrets in a file, a log, a prompt, or an error message.
- Weak encryption or a wrong use of AES-256-GCM or DPAPI.
- A command or script that runs code that the user did not ask for.
- A setup script that changes a system setting, the registry, or a machine-wide policy.
- A path problem that lets a file be read or written outside the data folder.
- A dependency with a known vulnerability that affects the application.

### Out of scope

- A provider that suspends an account. Read the risk section in `README.md`.
- An attacker who already controls the Windows account of the user. See "Limits of the protection".
- A weakness inside a provider site or inside the Classifier API.
- A problem that needs physical access to an unlocked computer.
- Reports about a feature that is "Planned" and has no code.

## What the application protects

| Asset | Where it is | Protection |
| --- | --- | --- |
| Session state of each account | `sessions\` in the data folder | Encrypted with AES-256-GCM. One file for each account. |
| The encryption key | `keys\` in the data folder | A random 32-byte key. DPAPI (current user scope) wraps the key. |
| API keys for the Classifier API | The same encrypted storage | Encrypted with the same key. |
| Conversations and usage records | `gauntlet.db` in the data folder | Local file. Not encrypted in version 1. See "Limits of the protection". |
| Logs | `logs\` in the data folder | The logger hides secrets. |

## Protections in detail

### No passwords

The application never stores a password. The user signs in in a visible browser. The application saves the session state only.

### Session encryption

- The session vault encrypts each session state with AES-256-GCM.
- Each encryption uses a new random nonce.
- GCM detects a change to the file. A changed file fails to decrypt. The application then returns an error and does not use the file.
- A file never holds session state in plain text. The tests check this.

### Key handling

- The application makes one random 32-byte key on the first run.
- DPAPI wraps the key for the current Windows user. Another Windows user cannot unwrap it.
- A PowerShell helper in `src/platform/windows/` does the wrap and the unwrap. It works on PowerShell 5.1 and 7.
- The application passes the key to the helper through stdin. It never passes the key as a command line argument. A process list can show arguments, but it cannot show stdin.
- The `KeyStore` interface hides all of this. No other code calls a Windows API.
- If the key cannot be unwrapped, the application returns an error. It deletes no file. It tells the user to run `gauntlet doctor`.

### Logs and errors

- The logger hides cookies, tokens, keys, and API keys.
- The application never writes the page content of a provider to a log.
- Error messages never include a secret.
- A test logs fake secrets and checks that none appears in the output.

### Data that leaves the machine

| Data | Goes to | When |
| --- | --- | --- |
| Session state | Only the provider site of that account | Inside each request, as normal browser cookies |
| Your request text and the selected context | The provider site that the router picks | For each request |
| The truncated prompt text | The Classifier API (Groq or OpenRouter) | For each classification, unless `localOnly` is on |
| The answer text, for a score | The Classifier API | Planned. The application does not send answer text in this version. |

- `gauntlet key set` shows a notice about the Classifier API before it saves a key. Without a saved key, the application sends nothing to the Classifier API.
- The option `localOnly` stops all calls to the Classifier API. The application then uses local rules only.
- The application sends no telemetry. It sends no usage data to the project.

### Setup and system changes

- `setup.ps1` asks before it installs a tool.
- `setup.cmd` sets the execution policy for that one run only.
- The application never changes a system setting, a registry key, or a machine-wide policy.
- The application changes only files inside the repository and inside the data folder.

### Safe file handling

- The code builds every path with the Node.js `path` module.
- The code checks that a path stays inside the data folder.
- The code writes a temporary file and then renames it. This keeps a file whole if a crash occurs.
- The code retries on `EBUSY` and `EPERM` errors, then returns an error.

### Controls that the application never bypasses

- The application never solves a CAPTCHA. If a CAPTCHA appears, it stops and asks the user.
- The application never gets around a rate limit or a usage limit.
- The application never reads a quota from a hidden endpoint.
- The project has stealth or anti-detection code.

## Limits of the protection

Read these limits. They are honest limits, not defects that the project hides.

- **DPAPI protects against other users, not against the same user.** A program that runs as you can ask DPAPI to unwrap the key. Malware that runs as you can read your sessions. The encryption protects the files at rest and against other Windows users. It does not protect against code that runs in your account.
- **The local store is not encrypted in version 1.** The database holds your conversations in plain text. Use Windows disk encryption (BitLocker) if the content is private. Encryption of the database is "Planned".
- **Session state is a credential.** Anyone who has a decrypted session can act as that account on the provider site. Treat it like a password.
- **The Classifier API sees your prompt text.** The text is truncated. Use `localOnly` if this is not acceptable.
- **The browser holds the session while it runs.** The headless browser keeps session state in memory during a request. The application closes the browser when the answer arrives.
- **Provider sites can detect automation.** Read the risk section in `README.md`.

## Advice for users

- Use accounts that you can afford to lose.
- Keep Windows and your browser up to date.
- Turn on BitLocker or another disk encryption.
- Use a Windows account with a strong password.
- Run `gauntlet logout <provider>` to delete the session of an account. In interactive mode, use `/logout <provider>`.
- To remove all data, delete the data folder `%LOCALAPPDATA%\llm-gauntlet`.
- If you think a session leaked, log out of the account on the provider site first. Then run `gauntlet logout <provider>`.
- Never share a file from `sessions\` or `keys\`. Never attach one to an issue.

## Rules for contributors

- Never commit a secret. This includes cookies, tokens, keys, API keys, and real session files.
- Never put a secret in a test. Use fake values that look fake.
- Sanitise every page snapshot. Read `docs/PROVIDERS.md`.
- Never log a secret. Use the logger of the application.
- Never pass a secret as a command line argument. Use stdin or a protected file.
- Never add a dependency that is not in `docs/PLAN.md` without approval.
- Never add a package that needs a native build without approval.
- Never add code that bypasses or hides anything on a provider site.
- Keep all Windows code in `src/platform/windows/`.
- Run `npm audit` before a release. Fix or document each high or critical finding.
- If you find a secret in the repository, do not open a public issue. Report it as a vulnerability. Then the maintainer removes it and rotates it.

## What the maintainer does for a release

These steps are Planned for the first release:

1. Run all tests on Windows.
2. Run `npm audit`.
3. Search the repository for secrets.
4. Check that the setup script changes no system setting.
5. Update this file if a protection changed.

## Planned changes

- Encryption of the local store. Status: Planned.
- Linux and macOS key storage (macOS Keychain and Linux Secret Service). Status: Planned. Read `docs/PORTING.md`.