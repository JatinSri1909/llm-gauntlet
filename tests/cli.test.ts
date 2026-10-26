import { CommanderError } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProgram } from '../src/cli/index.js';

const commandNames = [
  'login',
  'logout',
  'accounts',
  'ask',
  'chat',
  'usage',
  'config',
  'doctor',
  'key',
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

  it('lists all nine commands in the help text', async () => {
    const help = await runHelp();

    for (const name of commandNames) {
      expect(help).toContain(name);
    }
  });
});
