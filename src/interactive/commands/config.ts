import { getSetting, listSettings, setSetting } from '../../app/settings.js';

import { writeLine } from './write.js';
import type { SlashCommand } from './types.js';

/**
 * The config command. `/config` shows the settings, `/config <key>` shows one, and
 * `/config <key> <value>` changes one. It gives the same results as `gauntlet config`.
 */
export const configCommand: SlashCommand = {
  name: 'config',
  usage: '/config [key [value]]',
  summary: 'Show or change the settings.',
  run: async (args, context) => {
    const settings = { configFile: context.services.configFile };
    const [key, ...valueWords] = args;

    if (key === undefined) {
      writeLine(context, await listSettings(settings));
      return 'continue';
    }

    if (valueWords.length === 0) {
      writeLine(context, await getSetting(settings, key));
      return 'continue';
    }

    writeLine(context, await setSetting(settings, key, valueWords.join(' ')));
    writeLine(context, 'The new value applies the next time you start gauntlet.');
    return 'continue';
  },
};
