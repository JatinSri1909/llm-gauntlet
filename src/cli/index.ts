#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

import { registerCommands } from './commands/index.js';

export const INTERACTIVE_PLANNED_MESSAGE =
  'Interactive mode is Planned. Use "gauntlet --help" to list the commands.';

/** Build the command line program. */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('gauntlet')
    .description('Pool the free AI accounts of one user and pick an account for each task.')
    .showHelpAfterError();

  registerCommands(program);

  program.action(() => {
    console.log(INTERACTIVE_PLANNED_MESSAGE);
  });

  return program;
}

const entryPath = process.argv[1];
const thisFile = fileURLToPath(import.meta.url);
const isEntryPoint = entryPath !== undefined && path.resolve(entryPath) === path.resolve(thisFile);

if (isEntryPoint) {
  await createProgram().parseAsync(process.argv);
}
