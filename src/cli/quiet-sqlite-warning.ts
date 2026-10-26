/**
 * Hide the node:sqlite experimental notice. The store uses that module on purpose (decision D10).
 * Import this file first in an entry point. Node prints the notice when the module loads, so the
 * filter must be in place before any other import.
 */
export function hideSqliteNotice(): void {
  const listeners = process.listeners('warning');
  process.removeAllListeners('warning');
  process.on('warning', (warning) => {
    if (warning.name === 'ExperimentalWarning' && warning.message.includes('SQLite')) {
      return;
    }

    for (const listener of listeners) {
      listener(warning);
    }
  });
}

hideSqliteNotice();
