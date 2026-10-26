import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { migrationsFolder } from '../src/app/services.js';
import {
  RISK_NOTICE_CONFIRMATION,
  SqliteRiskNoticeStore,
  showRiskNotice,
} from '../src/cli/risk-notice.js';
import { SqliteDatabase } from '../src/store/database.js';
import { loadMigrations, runMigrations } from '../src/store/migrate.js';

let tempDir: string;
let database: SqliteDatabase;
let store: SqliteRiskNoticeStore;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-risk-'));
  database = new SqliteDatabase(path.join(tempDir, 'gauntlet.db'));
  runMigrations(database, await loadMigrations(migrationsFolder()));
  store = new SqliteRiskNoticeStore(database);
});

afterEach(async () => {
  database.close();
  await rm(tempDir, { recursive: true, force: true });
});

function makeIo(answer: string): {
  write: ReturnType<typeof vi.fn<(text: string) => void>>;
  ask: ReturnType<typeof vi.fn<(question: string) => Promise<string>>>;
} {
  return {
    write: vi.fn<(text: string) => void>(),
    ask: vi.fn<(question: string) => Promise<string>>(async () => answer),
  };
}

describe('risk notice', () => {
  it('stops the login on a wrong answer and saves nothing', async () => {
    const io = makeIo('not now');

    const accepted = await showRiskNotice({ store, io });

    expect(accepted).toBe(false);
    expect(store.hasConfirmed()).toBe(false);
    expect(io.write).toHaveBeenCalledTimes(2);
  });

  it('saves the typed confirmation on a correct answer', async () => {
    const io = makeIo(RISK_NOTICE_CONFIRMATION);

    const accepted = await showRiskNotice({ store, io });

    expect(accepted).toBe(true);
    expect(store.hasConfirmed()).toBe(true);

    const row = database.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [
      'riskNotice.confirmed',
    ]);
    expect(row?.value).toBe(RISK_NOTICE_CONFIRMATION);
  });

  it('does not show the notice again after a confirmation', async () => {
    await showRiskNotice({ store, io: makeIo(RISK_NOTICE_CONFIRMATION) });
    const io = makeIo('anything');

    const accepted = await showRiskNotice({ store, io });

    expect(accepted).toBe(true);
    expect(io.write).not.toHaveBeenCalled();
    expect(io.ask).not.toHaveBeenCalled();
  });
});
