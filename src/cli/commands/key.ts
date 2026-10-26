import { Command } from 'commander';

import { AppError } from '../../core/errors.js';
import { apiKeyName } from '../../decision/classifier.js';
import { CLASSIFIER_PROVIDERS, type ClassifierProvider } from '../../decision/api-classifier.js';
import { SecretStore } from '../../security/secret-store.js';
import { readSecret } from '../secret-input.js';

import { withServices } from './services.js';

/** The notice that the user reads before the first key is saved. */
export const CLASSIFIER_NOTICE = [
  'Classifier API notice',
  '',
  'With a key, llm-gauntlet sends the first 2000 characters of each request to the free',
  'classifier API of the provider. The API only decides how hard the task is.',
  'The rest of the request stays on this machine.',
  'To turn the API off, run: gauntlet config set localOnly true',
].join('\n');

/** The parts that a test can replace. */
export interface KeyCommandDeps {
  /** Read the secret. The default reads the terminal or a pipe. */
  readonly readSecret?: (prompt: string) => Promise<string>;
  /** Show one line of text to the user. */
  readonly write?: (text: string) => void;
}

/** Make the key command. It saves and removes the API key of the classifier. */
export function createKeyCommand(deps: KeyCommandDeps = {}): Command {
  const write = deps.write ?? ((text: string) => console.log(text));
  const read = deps.readSecret ?? ((prompt: string) => readSecret(prompt));

  const command = new Command('key').description('Save or remove the key of the classifier API.');

  command
    .command('set')
    .description(
      'Save the key. The key is read from the terminal or from a pipe, not from an argument.',
    )
    .argument('<provider>', `provider name: ${CLASSIFIER_PROVIDERS.join(' or ')}`)
    .action(async (providerName: string) => {
      const provider = parseProvider(providerName);
      write(CLASSIFIER_NOTICE);

      const key = await read(`Paste the ${provider} key and press Enter: `);
      await withServices(async (services) => {
        await new SecretStore(services.vault).save(apiKeyName(provider), key);
      });

      write(`Saved the ${provider} key. It is stored encrypted on this machine.`);
    });

  command
    .command('remove')
    .description('Delete the saved key.')
    .argument('<provider>', `provider name: ${CLASSIFIER_PROVIDERS.join(' or ')}`)
    .action(async (providerName: string) => {
      const provider = parseProvider(providerName);
      await withServices(async (services) => {
        await new SecretStore(services.vault).delete(apiKeyName(provider));
      });

      write(`Removed the ${provider} key.`);
    });

  return command;
}

function parseProvider(name: string): ClassifierProvider {
  const provider = CLASSIFIER_PROVIDERS.find(
    (candidate) => candidate === name.trim().toLowerCase(),
  );
  if (provider === undefined) {
    throw new AppError('USAGE', `The provider is not valid: ${name}`, {
      hint: `Use one of: ${CLASSIFIER_PROVIDERS.join(', ')}.`,
    });
  }

  return provider;
}
