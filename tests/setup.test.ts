import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const setupCmdPath = path.join(repoRoot, 'setup.cmd');
const setupPs1Path = path.join(repoRoot, 'setup.ps1');

describe('setup.cmd', () => {
  it('runs setup.ps1 with an execution policy for this run only', () => {
    const content = readFileSync(setupCmdPath, 'utf8');

    expect(content).toContain('%~dp0setup.ps1');
    expect(content).toContain('-ExecutionPolicy Bypass');
    expect(content).toContain('%*');
    expect(content).not.toContain('Set-ExecutionPolicy');
    expect(content).not.toContain('-Scope');
  });
});

describe.skipIf(process.platform !== 'win32')('setup.ps1 -CheckOnly', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-setup-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('checks the tools and creates nothing', () => {
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', setupPs1Path, '-CheckOnly'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, LOCALAPPDATA: tempDir },
      },
    );

    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    expect(result.status).toBe(0);
    expect(output).toContain('Node.js');
    expect(output).toContain('npm');
    expect(output).toContain('Git');
    expect(output).toContain('Data folder');
    expect(output).toContain('Check passed');
    expect(output).not.toContain('Installing the dependencies');
    expect(existsSync(path.join(tempDir, 'llm-gauntlet'))).toBe(false);
  });
});
