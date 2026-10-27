import type { RunRequestResult } from '../app/run-request.js';

/**
 * Format the status line that follows each answer. It shows the class, the account label, and
 * the model. Verbose mode adds the routing detail on a second line.
 */
export function formatStatusLine(result: RunRequestResult, verbose: boolean): string {
  const line = `class ${result.difficulty}  account ${result.account.label}  model ${result.model}`;
  if (!verbose) {
    return line;
  }

  const source = result.classification.source === 'api' ? 'classifier API' : 'local rules';
  const detail = [
    `first class ${result.classification.class} from ${source}`,
    `classifier API calls ${String(result.classification.apiAttempts)}`,
    result.escalated ? 'escalated once' : 'not escalated',
  ].join('; ');

  return `${line}\n  ${detail}`;
}
