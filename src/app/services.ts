import { AccountManager } from '../accounts/account-manager.js';
import { createPlatform } from '../platform/index.js';
import { AdapterRegistry } from '../providers/registry.js';
import { createMockAdapter } from '../providers/mock/mock-adapter.js';
import { SessionVault } from '../security/session-vault.js';
import { SqliteDatabase } from '../store/database.js';
import { loadMigrations, runMigrations } from '../store/migrate.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The services that the commands need. */
export interface Services {
  readonly database: SqliteDatabase;
  readonly accounts: AccountManager;
  readonly vault: SessionVault;
  readonly registry: AdapterRegistry;
  /** Close the files that the services hold. */
  close(): void;
}

/** The folder of the migration files. */
export function migrationsFolder(): string {
  const source = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'store',
    'migrations',
  );

  return source;
}

/** Make the services for this machine. */
export async function createServices(): Promise<Services> {
  const platform = createPlatform();
  const database = new SqliteDatabase(platform.dataPaths.databaseFile);
  runMigrations(database, await loadMigrations(migrationsFolder()));

  const registry = new AdapterRegistry();
  registry.register(createMockAdapter());

  return {
    database,
    accounts: new AccountManager(database),
    vault: new SessionVault({
      dataPaths: platform.dataPaths,
      keyStore: platform.keyStore,
    }),
    registry,
    close: () => {
      database.close();
    },
  };
}
