import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmdirSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const builtEntry = path.join(repoRoot, 'dist', 'cli', 'index.js');

// `npm link` runs the bin through a link to the package folder. A junction needs no rights on Windows.
describe.skipIf(process.platform !== 'win32' || !existsSync(builtEntry))(
  'the built bin behind a link',
  () => {
    it('prints the help text when it is started through a junction, like npm link does', () => {
      const folder = mkdtempSync(path.join(os.tmpdir(), 'llm-gauntlet-link-'));
      const link = path.join(folder, 'linked-package');
      symlinkSync(repoRoot, link, 'junction');

      try {
        const result = spawnSync(
          process.execPath,
          [path.join(link, 'dist', 'cli', 'index.js'), '--help'],
          { encoding: 'utf8' },
        );

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('gauntlet');
        expect(result.stdout).toContain('login');
      } finally {
        // rmdir removes only the junction. It never touches the repository that the junction points to.
        rmdirSync(link);
        rmSync(folder, { recursive: true, force: true });
      }
    });
  },
);
