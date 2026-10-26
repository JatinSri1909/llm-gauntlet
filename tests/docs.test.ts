import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createProgram } from '../src/cli/index.js';
import { SLASH_COMMANDS } from '../src/interactive/commands/index.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The files that the commands in the docs are checked in. */
function docFiles(): string[] {
  const folder = path.join(repoRoot, 'docs');
  const docs = readdirSync(folder)
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join(folder, name));

  return [
    path.join(repoRoot, 'README.md'),
    path.join(repoRoot, 'AGENTS.md'),
    path.join(repoRoot, 'CONTRIBUTING.md'),
    path.join(repoRoot, 'CONVENTIONS.md'),
    ...docs,
  ];
}

function read(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

/** Return the text of each inline code span in a document. */
function codeSpans(text: string): string[] {
  return [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1] ?? '');
}

describe('README', () => {
  const readme = read(path.join(repoRoot, 'README.md'));
  const cliCommands = createProgram().commands.map((command) => command.name());

  it('names only commands that exist in the CLI help', () => {
    const mentioned = codeSpans(readme)
      .filter((span) => span.startsWith('gauntlet '))
      .map((span) => span.split(/\s+/)[1] ?? '');

    expect(mentioned.length).toBeGreaterThan(0);
    for (const name of mentioned) {
      expect(cliCommands, `README mentions gauntlet ${name}`).toContain(name);
    }
  });

  it('lists every CLI command in the usage table', () => {
    for (const name of cliCommands) {
      expect(readme, `README lists gauntlet ${name}`).toContain(`gauntlet ${name}`);
    }
  });

  it('names only slash commands that exist in the prompt', () => {
    const slashNames = SLASH_COMMANDS.map((command) => command.name);
    const mentioned = codeSpans(readme)
      .filter((span) => /^\/[a-z]/.test(span))
      .map((span) => span.slice(1).split(/\s+/)[0] ?? '');

    expect(mentioned.length).toBeGreaterThan(0);
    for (const name of mentioned) {
      expect(slashNames, `README mentions /${name}`).toContain(name);
    }
  });

  it('points at setup files that exist', () => {
    expect(existsSync(path.join(repoRoot, 'setup.ps1'))).toBe(true);
    expect(existsSync(path.join(repoRoot, 'setup.cmd'))).toBe(true);
    expect(readme).toContain('.\\setup.ps1');
  });
});

describe('docs', () => {
  const scripts = JSON.parse(read(path.join(repoRoot, 'package.json'))).scripts as Record<
    string,
    string
  >;

  it('names only npm scripts that package.json defines', () => {
    for (const file of docFiles()) {
      const text = read(file);
      for (const match of text.matchAll(/npm run ([\w:-]+)/g)) {
        const name = match[1] ?? '';
        expect(Object.keys(scripts), `${path.basename(file)} runs npm run ${name}`).toContain(name);
      }
    }
  });

  it('uses no em dash character', () => {
    for (const file of docFiles()) {
      expect(read(file), path.basename(file)).not.toContain('—');
    }
  });
});
