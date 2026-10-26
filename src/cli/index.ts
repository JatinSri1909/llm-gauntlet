#!/usr/bin/env node
import './quiet-sqlite-warning.js';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

import { AppError } from '../core/errors.js';

import { runChat } from './commands/chat.js';
import { registerCommands } from './commands/index.js';

/** Build the command line program. */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('gauntlet')
    .description('Pool the free AI accounts of one user and pick an account for each task.')
    .showHelpAfterError();

  registerCommands(program);

  program.action(async () => {
    await runChat();
  });

  return program;
}

const entryPath = process.argv[1];
const thisFile = fileURLToPath(import.meta.url);
const isEntryPoint = entryPath !== undefined && path.resolve(entryPath) === path.resolve(thisFile);

if (isEntryPoint) {
  await runFromTerminal(process.argv);
}

/**
 * Run the program from the terminal. A typed error prints its message and hint instead of a stack
 * trace.
 */
async function runFromTerminal(argv: string[]): Promise<void> {
  try {
    await createProgram().parseAsync(argv);
  } catch (error) {
    if (!(error instanceof AppError)) {
      throw error;
    }

    console.error(error.message);
    if (error.hint !== undefined) {
      console.error(error.hint);
    }
    process.exitCode = 1;
  }
}
