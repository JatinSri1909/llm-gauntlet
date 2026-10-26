import { Command } from 'commander';

/** Make a command that prints a Planned message and exits with code 0. */
export function createPlannedCommand(
  name: string,
  description: string,
  argument?: { name: string; description: string },
): Command {
  const command = new Command(name).description(`${description} Planned.`);

  if (argument !== undefined) {
    command.argument(argument.name, argument.description);
  }

  command.action(() => {
    console.log(`The ${name} command is Planned.`);
  });

  return command;
}
