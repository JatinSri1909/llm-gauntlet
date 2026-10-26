import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CommanderError } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProgram, INTERACTIVE_PLANNED_MESSAGE } from '../src/cli/index.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'src', 'cli', 'index.ts');
const commandNames = ['login', 'logout', 'accounts', 'ask', 'chat', 'usage', 'config', 'doctor'];

const stubCases: Array<[string, string[]]> = [
  ['login', ['login', 'claude']],
  ['logout', ['logout', 'claude']],
  ['accounts', ['accounts']],
  ['ask', ['ask', 'Explain a thread.']],
  ['chat', ['chat']],
  ['usage', ['usage']],
  ['config', ['config']],
  ['doctor', ['doctor']],
];

async function runHelp(): Promise<string> {
  const program = createProgram();
  program.exitOverride();

  let output = '';
  program.configureOutput({
    writeOut: (text) => {
      output += text;
    },
    writeErr: (text) => {
      output += text;
    },
  });

  try {
    await program.parseAsync(['node', 'gauntlet', '--help']);
  } catch (error) {
    if (!(error instanceof CommanderError && error.exitCode === 0)) {
      throw error;
    }
  }

  return output;
}

describe('CLI shell', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists all eight commands in the help text', async () => {
    const help = await runHelp();

    for (const name of commandNames) {
      expect(help).toContain(name);
    }
  });

  it('prints a planned message when there are no arguments', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await createProgram().parseAsync(['node', 'gauntlet']);

    expect(log).toHaveBeenCalledWith(INTERACTIVE_PLANNED_MESSAGE);
  });

  it.each(stubCases)('prints a planned message for the %s command', async (name, args) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await createProgram().parseAsync(['node', 'gauntlet', ...args]);

    expect(log).toHaveBeenCalledWith(`The ${name} command is Planned.`);
  });

  it('exits with code 0 for a stub command', () => {
    const output = execFileSync(process.execPath, ['--import', 'tsx', cliPath, 'accounts'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(output).toContain('The accounts command is Planned.');
  });
});
