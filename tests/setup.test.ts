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

describe('setup.ps1 global link question', () => {
  it('treats a missing terminal as the answer no, so a finished setup does not fail at the end', () => {
    const content = readFileSync(setupPs1Path, 'utf8');

    const question = content.indexOf("Read-Host 'Create the global link now?");
    const before = content.slice(Math.max(0, question - 200), question);
    const after = content.slice(question, question + 200);

    expect(question).toBeGreaterThan(-1);
    expect(before).toMatch(/try\s*\{\s*\$linkAnswer = $/);
    expect(after).toMatch(/\}\s*catch\s*\{\s*\$linkAnswer = ''/);
    expect(content).toContain("npm.cmd' -Arguments @('link')");
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
    // The setup needs Node.js 24. A machine with an older Node.js must fail the check, not pass it.
    const nodeMajor = Number(process.versions.node.split('.')[0]);
    if (nodeMajor >= 24) {
      expect(result.status).toBe(0);
      expect(output).toContain('Check passed');
    } else {
      expect(result.status).toBe(1);
      expect(output).toContain('too old');
      expect(output).toContain('Check failed');
    }
    expect(output).toContain('Node.js');
    expect(output).toContain('npm');
    expect(output).toContain('Git');
    expect(output).toContain('Data folder');
    expect(output).not.toContain('Installing the dependencies');
    expect(existsSync(path.join(tempDir, 'llm-gauntlet'))).toBe(false);
  });
});
