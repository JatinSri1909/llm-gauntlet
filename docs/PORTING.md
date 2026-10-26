# Porting

This file explains the steps to add Linux or macOS support to llm-gauntlet.

Status: Planned. Linux and macOS are not supported. Version 1 supports Windows 10 and Windows 11 only. This file is a plan. No port code exists. Each port is one later part: L6 for Linux and L7 for macOS. Read `docs/PLAN.md`.

## Platform status

| Platform | Status |
| --- | --- |
| Windows 10 | Planned for version 1 |
| Windows 11 | Planned for version 1 |
| Linux | Planned (part L6) |
| macOS | Planned (part L7) |

## Goal

A port adds a new folder and a new factory case. It changes no other code.

Version 1 prepares for this. The project follows these rules:

- All Windows code is in `src/platform/windows/`.
- The rest of the code uses the interfaces `KeyStore`, `DataPaths`, and `ShellRunner`.
- A factory picks the code from `process.platform`. On Linux and macOS, it throws an error that says the platform is "Planned".
- The code builds every path with the Node.js `path` module.
- Tests use the in-memory platform code from `src/platform/memory/`.

Read decision D7 in `docs/DECISIONS.md`.

## What a port must provide

| Windows part in version 1 | What a port needs |
| --- | --- |
| `KeyStore` with DPAPI and a PowerShell helper | A new `KeyStore` that uses the secret storage of the platform |
| `DataPaths` with `%LOCALAPPDATA%` | A new `DataPaths` with the correct data folder of the platform |
| `ShellRunner` for PowerShell | A new `ShellRunner` for the shell tools of the platform |
| `setup.ps1` and `setup.cmd` | A setup path for the platform |
| Edge as the first browser (`channel: "msedge"`) | A browser order that fits the platform |
| `.gitattributes` with CRLF for `*.ps1` and `*.cmd` | A review of the line endings |
| Windows CI on `windows-latest` | A CI job on the new platform |
| Long path, file lock, and antivirus delay code | A review of the file code for the new platform |

## Interfaces

The interfaces are in `src/platform/types.ts`. Part P07 writes them. A port implements each one.

| Interface | Job |
| --- | --- |
| `KeyStore` | Make, store, and read the encryption key. The key never appears in a log or in an argument. |
| `DataPaths` | Return the data folder and the paths of the files in it. |
| `ShellRunner` | Run a helper program and pass input through stdin. |

A port must not change an interface. If an interface cannot fit a platform, stop and open an issue. A change to an interface changes all platforms and needs approval.

## Linux plan

All items are Planned.

- **Folder:** `src/platform/linux/`.
- **`KeyStore`:** Use the Secret Service of the desktop session. Several desktop environments provide it. Part L6 picks the library or the helper. It must not need a native build (decision D6 and the dependency rules in `docs/PLAN.md`).
- **No Secret Service case:** Many servers and minimal systems have no Secret Service. Part L6 decides what the application does then. The choices are an error with a clear message, or an encrypted key file that is protected by a passphrase. This needs approval, because it changes the security model. Read `docs/SECURITY.md`.
- **`DataPaths`:** Follow the XDG rules. Use `XDG_DATA_HOME` if it is set. If not, use a `.local/share` folder inside `os.homedir()`. The folder name is `llm-gauntlet`.
- **Browser:** Use the Playwright Chromium as the first choice. Use an installed browser only if the maintainer approves it.
- **Setup:** Part L6 decides the setup path. See "Setup scripts".
- **Terminal:** Test interactive mode in common terminals. Test the case when the output is not a terminal.
- **CI:** Add a Linux job.

## macOS plan

All items are Planned.

- **Folder:** `src/platform/macos/`.
- **`KeyStore`:** Use the macOS Keychain. Part L7 picks the library or the helper. It must not need a native build.
- **`DataPaths`:** Use the `Library/Application Support` folder inside `os.homedir()`. The folder name is `llm-gauntlet`.
- **Browser:** Use the Playwright Chromium as the first choice. Use an installed browser only if the maintainer approves it.
- **Setup:** Part L7 decides the setup path. See "Setup scripts".
- **Terminal:** Test interactive mode in the default terminal and in one other terminal.
- **Permissions:** Check if the Keychain asks the user for permission. Write the result in this file.
- **CI:** Add a macOS job.

## Setup scripts

The version 1 setup entry point is `setup.ps1`. The project rule is that scripts and docs show PowerShell commands.

PowerShell 7 runs on Linux and macOS. A port can reuse `setup.ps1` if the script detects the platform and runs the correct checks. This keeps one setup script for all platforms. The other choice is a new native setup script. Part L6 decides this and asks for approval before it writes a script.

A port setup script must follow the same rules as the Windows script:

- It checks for Node.js, npm, and Git.
- It asks before it installs anything.
- It changes no system setting and no machine-wide policy.
- It changes only files inside the repository and the data folder.

## Steps to add a platform

Use these steps in this order. Each step is one commit.

1. **Open an issue.** Name the platform. List the tools that you plan to use for the key store. Wait for approval. A port is a part in `docs/PLAN.md`.
2. **Check the dependency rules.** The key store must not need a native build. If it does, ask for approval first.
3. **Make the folder.** Add `src/platform/<platform>/`.
4. **Write the `DataPaths` code and tests.** Use fake environment values in the tests.
5. **Write the `KeyStore` code and tests.** Test the round trip. Test that the key never appears in the process arguments.
6. **Write the `ShellRunner` code and tests.** Test that input goes through stdin.
7. **Add the factory case.** Change `src/platform/index.ts`. Replace the "Planned" error for this platform.
8. **Check the file code.** Run the tests for atomic write and retry. Change the code only inside the platform folder if you can.
9. **Check the browser order.** Update the launcher config if the platform needs a different order.
10. **Add the setup path.** Follow "Setup scripts".
11. **Add the CI job.** Run lint, build, and tests on the new platform.
12. **Run the manual check.** The maintainer runs `gauntlet doctor`, `gauntlet login`, and one request with a real account on the new platform. This check is not part of the test suite.
13. **Update the docs.** Change the platform status in `README.md`, in this file, and in `docs/ARCHITECTURE.md`. Add a decision record to `docs/DECISIONS.md`. Update `docs/SECURITY.md` for the new key store.
14. **Open a pull request.** Use the pull request template.

## What not to change

A port must not change these items:

- The three interfaces, without approval.
- The database schema, without approval.
- The adapters, unless a page works differently on the new platform. If so, open an issue first.
- The security rules. The application still never stores passwords. It still never bypasses a control.

## Tests for a port

- All tests that pass on Windows must pass on the new platform, except tests that are only for the Windows code.
- Tests for Windows code run only on Windows. Mark them clearly.
- The new platform code has its own tests, in the same style as the Windows tests.
- Tests use no real account.
- Tests use the Node.js `path` module for every path.

## Acceptance checklist

A port is done when all items are true:

- The factory returns the new platform code, with no "Planned" error.
- `npm test` passes on the new platform.
- The CI job for the new platform passes.
- `gauntlet doctor` passes on a clean machine.
- The key never appears in a log, a prompt, or a process argument.
- The setup path works on a clean machine.
- The docs show the correct status.
- The maintainer did the manual check.

## Open questions

These questions are open. Each one needs a decision before the port part starts.

- What does the application do on Linux when no Secret Service is available?
- Does the project reuse `setup.ps1` with PowerShell 7, or does it add a native setup script?
- Which browser order fits Linux and macOS?
- Does the interactive mode need changes for other terminals?