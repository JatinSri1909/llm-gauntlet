# Agent rules

This file gives rules to AI coding agents that work on llm-gauntlet. A human can read it too.

Status: Build parts P01 to P33 are built. Some commands below work only after the build part that adds them. Read `docs/PLAN.md` for the build order.

All commands in this file are PowerShell commands.

## Project summary

llm-gauntlet is an open source terminal application for Windows 10 and Windows 11. It connects the free accounts of one user on many AI platforms. A decision layer picks one account and one model for each task. The application keeps all data on the local machine. Linux and macOS are "Planned".

## Read these files first

1. `docs/PLAN.md` for the build parts and the order.
2. `docs/DECISIONS.md` for the decisions. Do not change a decision.
3. `docs/ARCHITECTURE.md` for the components and the terms.
4. `CONVENTIONS.md` for the code style and the rules.
5. `docs/SECURITY.md` for the security rules.
6. `docs/PROVIDERS.md` if the work touches an adapter.
7. `docs/PORTING.md` if the work touches the platform layer.

Use the same terms as these files. Do not invent a second word for the same thing.

## Commands

Run these commands from the repository root in PowerShell 7 or Windows PowerShell 5.1.

| Job | Command |
| --- | --- |
| Install the dependencies | `npm ci` |
| Run setup on a new machine | `.\setup.ps1` |
| Check the setup tools only | `.\setup.ps1 -CheckOnly` |
| Build | `npm run build` |
| Lint | `npm run lint` |
| Format | `npm run format` |
| Run all tests | `npm test` |
| Run one test file | `npx vitest run tests/<name>.test.ts` |
| Run the CLI from source | `npx tsx src/cli/index.ts --help` |

Notes:

- A command works only after the build part that adds it. Part P01 adds `build`, `lint`, `format`, and `test`. Part P09 adds `-CheckOnly`.
- Run `npm run lint`, `npm run build`, and `npm test` after each change. All three must pass.
- Show the real output. Do not claim a result that you did not run.
- Use PowerShell commands only. Never write a bash-only command in a script or in a doc.

## Folder map

```text
llm-gauntlet/
    setup.ps1           Setup entry point
    setup.cmd           Wrapper that sets the execution policy for one run
    src/
        cli/            Commands
        interactive/    Prompt, slash commands, status line
        app/            Request runner
        decision/       Classifier, router, quality check, escalation
        context/        Context store and selector
        usage/          Usage tracker
        accounts/       Account manager and login flow
        providers/      Adapter interface, registry, mock, claude
        browser/        Browser launcher
        security/       Session vault, secret store
        store/          Database and migrations
        platform/       Interfaces and factory
            windows/    All Windows code
            memory/     In-memory code for tests
        doctor/         Self checks
        core/           Config, logger, errors
    tests/              Tests
        fixtures/       Sanitised snapshots and test data
    docs/               Plan, architecture, decisions, providers, security, porting
```

The data folder of the application is `%LOCALAPPDATA%\llm-gauntlet`. It is not in the repository.

## How to work

The work has three stages. Never start a later stage before the maintainer approves the earlier stage.

1. **Planning.** Done. The decisions are in `docs/DECISIONS.md`.
2. **Documentation.** The maintainer approves each file.
3. **Build.** Follow the steps below.

### Build steps

1. Work on one part at a time. Use the order in `docs/PLAN.md`.
2. Write only the code for that part.
3. Write the tests for that part.
4. Run the tests in PowerShell. Show the output.
5. Report what changed, what you tested, and what remains.
6. Give the maintainer a commit message in the Conventional Commits format.
7. Do not run `git commit`. Do not run `git push`. The maintainer commits.
8. Stop. Wait for the maintainer to say "next".

### Report format

Write the report in short sentences. Include these items:

- The part name and number.
- The files that you changed.
- The commands that you ran and their result.
- What you did not test, and why.
- The commit message.

Do not claim a result that you did not run.

## Always do

- Follow the part in `docs/PLAN.md`: its goal, its files, its test, and its "done when" check.
- Build every path with the Node.js `path` module.
- Put all Windows code in `src/platform/windows/`.
- Use the interfaces `KeyStore`, `DataPaths`, and `ShellRunner`.
- Use mock adapters and fake services in all tests.
- Use headless mode for all work except login.
- Send the minimum context.
- Select the cheapest model that can do the task. Escalate only if the answer fails the quality check, or if the user asks.
- Mark a feature that does not exist yet as "Planned" in the docs.
- Mark Linux and macOS as "Planned" in every doc.
- Change only files inside the repository.
- Keep the application building and the tests passing after each part.

## Never do

These actions are forbidden. A change that does one of them must be rejected.

### Security

- Never store a password. Store session state only. Encrypt it.
- Never write a secret to a log, a prompt, an error message, a test, or a commit.
- Never bypass a CAPTCHA, a rate limit, or a usage limit. If a CAPTCHA appears, stop and ask the user to solve it in a visible window.
- Add code that hides the automation from a provider. Add stealth tools, fake user agents, or random human-like actions.
- Never read a quota from a hidden endpoint.
- Never pass a secret as a command line argument. Use stdin.
- Never commit a real session file, a real key, a real cookie, or an unsanitised page snapshot.

### Accounts and network

- Never use a real account in a test.
- Never call a real provider site or a real API in a test.
- Never sign in to an account for the maintainer.

### System

- Never change a system setting, a registry key, or a machine-wide policy.
- Never change the PowerShell execution policy for the machine or for the user. Only `setup.cmd` sets it, and only for one run.
- Never install a tool without asking.
- Never change a file outside the repository.

### Git

- Never run `git commit`.
- Never run `git push`.
- Never rewrite history. Do not run `git rebase`, `git reset --hard`, or `git push --force`.

### Scope

- Never start a part that is not next in `docs/PLAN.md`.
- Never do the work of more than one part at a time.
- Never add a feature that is not in the part.
- Never describe a feature that does not exist, unless you mark it "Planned".

## Ask first

Stop and ask the maintainer before any of these actions:

- Add a dependency that is not in `docs/PLAN.md`.
- Add a dependency that needs a native build.
- Delete a file.
- Change the database schema after part P11 is committed.
- Change a decision in `docs/DECISIONS.md`.
- Add a part that is not in `docs/PLAN.md`.
- Change one of the interfaces `KeyStore`, `DataPaths`, or `ShellRunner`.
- Add a new top-level folder in `src/`.

When you ask, give a short reason and your recommended answer.

## Stop conditions

Stop and report in these cases:

- A test fails twice after two fix attempts. Show the failing output and your two attempts.
- A part needs more than one commit. Propose how to split the part, and ask.
- You need a real account to continue.
- You need a page snapshot that the maintainer has not supplied.
- A rule in this file conflicts with the part. Ask which one wins.
- You do not understand the part. Ask. Do not guess.

## Windows notes for agents

- The shell is PowerShell 7 or Windows PowerShell 5.1. Write code that works with both when the code runs a PowerShell script.
- Source files use LF. PowerShell and `.cmd` files use CRLF. The file `.gitattributes` sets this.
- Windows can lock files. Antivirus software can delay a file. The safe file code retries on `EBUSY` and `EPERM` errors. Use it.
- Keep path length in mind. Handle the Windows long path limit in the file code.
- Tests that need Windows are Windows tests. Mark them clearly.

## Style summary

Read `CONVENTIONS.md` for the full rules. The short list:

- TypeScript `strict` mode. No `any`.
- ES modules with the `node:` prefix for built-in modules.
- Named exports.
- Kebab-case file names. PascalCase for types and classes. camelCase for functions and variables.
- Typed errors. Provider events such as a limit or a CAPTCHA are signals, not errors.
- Docs in ASD-STE100 style: short sentences, active voice, one instruction in each sentence.
- Do not use the em dash character in docs.

## Commit message format

Give the maintainer a message in the Conventional Commits format:

```text
<type>(<scope>): <short summary>

<body, if needed>
```

Use the types `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`, and `build`. Keep the summary at 72 characters or fewer, in the imperative mood, with no full stop. One build part is one commit.

## Definition of done for a part

A part is done when all items are true:

- The code does only what the part says in `docs/PLAN.md`.
- The tests for the part exist and pass.
- `npm run lint`, `npm run build`, and `npm test` pass on Windows.
- No secret is in the change.
- No real account was used.
- The docs match the code.
- You gave the maintainer the report and the commit message.
- You stopped and are waiting for "next".

## When you are unsure

Ask a short question. Say what you know, what you do not know, and what you recommend. A wrong guess costs more than a question.