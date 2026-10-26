# Conventions

This file sets the code style, the naming rules, the folder layout, the test rules, and the commit message format for llm-gauntlet.

Status: Build parts P01 to P33 are built. Part P01 adds the tools that enforce many of these rules. Read `docs/PLAN.md` for the build order.

All commands in this file are PowerShell commands.

## How to use this file

- Follow these rules in all code, tests, scripts, and docs.
- A tool enforces a rule when the tool name is in the rule. Fix the tool error. Do not turn the rule off.
- If a rule is wrong, open an issue. Do not break the rule in a pull request.
- A rule about a decision comes from `docs/DECISIONS.md`. Do not change it without approval.

## Tools

| Tool | Job | Command |
| --- | --- | --- |
| TypeScript | Compile and check types | `npm run build` |
| ESLint | Find code problems | `npm run lint` |
| Prettier | Format code | `npm run format` |
| Vitest | Run tests | `npm test` |

Run `npm run lint`, `npm run build`, and `npm test` before each commit. All three must pass.

## Code style

### Language settings

- The project uses TypeScript on the current Node.js LTS version.
- The `tsconfig.json` file turns on `strict` mode. Do not turn it off.
- Use ES modules. Use the `node:` prefix for built-in modules. Example: `import path from 'node:path';`.
- Do not use `any`. Use `unknown` and check the type.
- Do not use `@ts-ignore`. If you must suppress a type error, use `@ts-expect-error` and write a comment that says why.
- Do not use non-null assertions (`!`) unless a comment says why the value cannot be null.
- Mark data that does not change as `readonly` or `const`.

### Format

Prettier sets the format. Do not argue about format in a review.

- Indent with 2 spaces.
- Use single quotes.
- End statements with a semicolon.
- Use trailing commas in lists that span more than one line.
- Keep lines at 100 characters or fewer.
- Source files use LF line endings. PowerShell and `.cmd` files use CRLF. The file `.gitattributes` sets this.

### Structure

- One file has one main job. Split a file that grows past about 300 lines, unless one clear reason says to keep it whole.
- One function has one job. Keep functions short.
- Prefer small pure functions. A pure function has the same output for the same input and has no side effects.
- Put side effects (files, network, browser, time, random) behind an interface. Tests then replace them with fakes.
- Pass dependencies as arguments. Do not read global state in the middle of a function.
- Use `async` and `await`. Do not mix them with `.then` chains.
- Do not leave dead code or commented-out code in a commit.
- Use named exports. Do not use default exports, except where a tool needs one (for example `eslint.config.js`).

### Errors

- Use typed error classes from `src/core/errors.ts`. Do not throw a plain string or a plain `Error` for a known case.
- Each error has a short code, a clear message, and a hint for the user when one exists.
- An error message never holds a secret.
- A provider event that is not a failure is a signal and not an error. The signals are `LimitReached`, `CaptchaRequired`, and `SessionExpired`. Read `docs/PROVIDERS.md`.
- Do not catch an error and ignore it. Handle it, wrap it with more context, or let it go up.
- The CLI is the only place that turns an error into text for the user and an exit code.

### Comments

- Write a comment to say why. Do not write a comment to repeat what the code does.
- Write a short comment on each exported function and each interface.
- Write comments in the same style as the docs: short sentences, active voice.
- Write `TODO` only with an issue number. Example: `TODO(#42)`.

### Logging

- Use the logger from `src/core/logger.ts`. Do not use `console.log` outside the CLI and interactive mode output code.
- Never log a secret, a cookie, a token, a key, or a page content.
- Use log levels: `error`, `warn`, `info`, and `debug`.

## Windows rules

- Build every path with the Node.js `path` module. Never write a slash by hand.
- Never hardcode a drive letter or a user folder.
- Put all Windows-specific code in `src/platform/windows/`. No other folder calls a Windows API.
- Use the interfaces `KeyStore`, `DataPaths`, and `ShellRunner` from `src/platform/`.
- Write files with the safe file code from `src/platform/windows/safe-fs.ts`. It writes a temporary file and renames it. It retries on `EBUSY` and `EPERM` errors.
- Do not assume that a file can be deleted or renamed at once. Antivirus software and other programs can lock it.
- Keep path length in mind. Handle the Windows long path limit in the file code.
- Pass secrets through stdin. Never pass a secret as a command line argument.
- A test that needs Windows is marked as a Windows test. Read "Test rules".

## PowerShell scripts

These rules apply to `setup.ps1`, the DPAPI helper, and any other `.ps1` file.

- The script works on Windows PowerShell 5.1 and on PowerShell 7.
- Start the script with `Set-StrictMode -Version Latest` and `$ErrorActionPreference = 'Stop'`.
- Use approved PowerShell verbs for function names. Example: `Get-`, `Test-`, `New-`.
- Use `Join-Path` for paths. Never write a slash by hand.
- Ask before you install a tool. Never install a tool without a question.
- Never change a system setting, a registry key, or a machine-wide policy.
- Never write a bash-only command in a script or in a doc.
- Use CRLF line endings.
- Write the output in short plain sentences. Say what failed and how to fix it.

## Naming

| Item | Style | Example |
| --- | --- | --- |
| File and folder | `kebab-case` | `usage-tracker.ts` |
| Class and interface | `PascalCase` | `KeyStore`, `UsageTracker` |
| Type alias | `PascalCase` | `DifficultyClass` |
| Function and variable | `camelCase` | `selectContext` |
| Constant | `UPPER_SNAKE_CASE` for true constants | `MAX_CONTEXT_TOKENS` |
| Enum member | `PascalCase` | `AccountState.CoolingDown` |
| Test file | Same name as the file, with `.test.ts` | `usage-tracker.test.ts` |
| SQL file | Number and name | `001-initial.sql` |
| Config key | `camelCase` | `localOnly` |
| Slash command | Lowercase | `/resume` |

More naming rules:

- Do not put the letter `I` before an interface name. Write `KeyStore`, not `IKeyStore`.
- Name a function with a verb. Name a value with a noun.
- Name a boolean with `is`, `has`, `can`, or `should`. Example: `isSignedIn`.
- Use the terms from `docs/ARCHITECTURE.md`. Write `account`, `adapter`, `session state`, `class`, and `cooling down`. Do not invent a second word for the same thing.
- Do not use short unclear names. Allowed short names: `i` in a small loop, and `e` for an error in a short block.
- Write the provider name in lowercase in code. Example: `claude`.

## Folder layout

```text
llm-gauntlet/
    setup.ps1
    setup.cmd
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
    tests/
        fixtures/       Sanitised snapshots and test data
    docs/
```

### Dependency direction

A folder may import only from the folders that the diagram in `docs/ARCHITECTURE.md` allows.

- `src/core/` imports from no other `src/` folder.
- `src/platform/` imports only from `src/core/` and from itself.
- `src/cli/` and `src/interactive/` are the top layer. No other folder imports from them.
- `src/providers/` never imports from `src/decision/`, `src/usage/`, or `src/context/`.
- No folder outside `src/platform/windows/` imports from `src/platform/windows/`. Code gets the platform through the factory.
- No circular imports.

ESLint checks the import rules with restricted import patterns. Part P07 adds the rule for `src/platform/windows/`.

### Files

- Each folder has one `index.ts` that exports the public items. Other folders import from the `index.ts` and not from a deep file.
- Keep a file next to the code that uses it.
- Do not add a new top-level folder in `src/` without approval.

## Database rules

- All schema changes are numbered migration files in `src/store/migrations/`.
- Never edit a migration after it is merged. Add a new migration.
- After part P11 is committed, a schema change needs approval.
- Use parameters in every query. Never build a query by joining strings.
- The database holds no session state and no secret.

## Security rules in code

- Never store a password.
- Never write a secret to a log, a prompt, a commit, an error message, or a test.
- Use fake values in tests, and make them look fake. Example: `fake-token-for-tests`.
- Never bypass a CAPTCHA, a rate limit, or a usage limit.
- Never add code that hides the automation from a provider.
- Use headless mode for all work except login.
- Send the minimum context.
- Read `docs/SECURITY.md` for the full list.

## Dependencies

- Add only the packages in `docs/PLAN.md`.
- To add a package, update `docs/PLAN.md` first and get approval.
- Do not add a package that needs a native build without approval.
- Pin the exact versions through `package-lock.json`. Use `npm ci` in scripts and in CI.
- Prefer a built-in Node.js module when it does the job.

## Test rules

### General

- Use Vitest.
- Put tests in `tests/`. Name each file `<name>.test.ts`.
- Each build part ships with its tests. The part is not done without them.
- A test must fail when the code is wrong. Check this when you write the test.
- A test checks one behavior. Name it so that the name says the behavior. Example: `skips an account that is cooling down`.
- Use the pattern: set up, act, check. Separate the three steps with a blank line.
- Tests do not depend on each other. Tests do not depend on the order of other tests.

### What tests may use

- Tests use mock adapters and fake services. A test never uses a real account.
- A test never calls the real network. Use a fake `fetch` or a local test server.
- A test never uses the real data folder. Use a temporary folder and remove it after the test.
- A test never reads the real clock when time matters. Use a fake clock.
- A test never uses random values that change the result. Use a fixed seed or a fake source.
- A test never prints a secret.

### Windows tests

- All tests must pass on Windows. The CI runs on `windows-latest`.
- A test for Windows-only code (for example DPAPI) is a Windows test. Skip it with a clear reason on other platforms.
- A test that needs PowerShell checks both PowerShell 5.1 and PowerShell 7 when the code works with both.

### Fixtures and snapshots

- Page snapshots are in `tests/fixtures/<provider>/`.
- Sanitise each snapshot. Read `docs/PROVIDERS.md`.
- A snapshot holds no real name, email address, token, or cookie.

### Coverage by area

| Area | The tests check |
| --- | --- |
| Logger | A fake secret never appears in the output. |
| Session vault | The round trip works. A changed file fails. A wrong key fails. The file holds no plain text. |
| KeyStore | The round trip works. The key never appears in process arguments. |
| Router | The cheapest model rule, the cooling down skip, the fallback, and the no-account error. |
| Quality check | Each failure type. Escalation happens once and never loops. |
| Adapters | Sign-in check, send, answer read, limit signal, CAPTCHA signal, layout change. |
| Interactive mode | Scripted input, slash commands, and the status line. |

## Docs rules

- Write in ASD-STE100 style. Use short sentences. Use the active voice. Write one instruction in each sentence.
- Use the same term for the same thing in all files. Use the terms in `docs/ARCHITECTURE.md`.
- Show PowerShell commands. Never show a bash-only command.
- Mark Linux and macOS as "Planned" in every doc.
- Do not describe a feature that does not exist. Mark it "Planned".
- Change a "Planned" mark to "Done" only after the build part is merged.
- Use Mermaid for diagrams.
- Do not use the em dash character. Use a full stop or a comma.

## Commit message format

The project uses Conventional Commits.

```text
<type>(<scope>): <short summary>

<body, if needed>
```

| Type | Use it for |
| --- | --- |
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | A change to docs only |
| `test` | A change to tests only |
| `refactor` | A code change that does not change behavior |
| `chore` | A task that does not change code behavior (for example tool settings) |
| `ci` | A change to the CI workflow |
| `build` | A change to the build or the dependencies |

Rules:

- The scope is the area of the code. Examples: `cli`, `interactive`, `decision`, `store`, `platform`, `providers`, `security`, `docs`.
- The summary is in the imperative mood. It has no full stop at the end. It is 72 characters or fewer.
- The body says why you made the change.
- Write `BREAKING CHANGE:` in the body for a change that breaks existing behavior.
- One commit is one logical change. One build part is one commit.
- A pull request title uses the same format. The project uses squash merge, and the title becomes the commit message.

Examples:

```text
feat(decision): add local task classifier
fix(platform): retry atomic rename on EBUSY
docs(security): add limits of the protection
test(vault): check that a changed file fails to decrypt
```

## Definition of done for a part

A build part is done when all items are true:

- The code does only what the part says in `docs/PLAN.md`.
- The tests for the part exist and pass.
- `npm run lint`, `npm run build`, and `npm test` pass on Windows.
- No secret is in the change.
- No real account was used.
- The docs match the code.
- The commit message follows this file.