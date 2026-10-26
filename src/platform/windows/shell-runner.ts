import { spawn } from 'node:child_process';

import { PlatformError } from '../../core/errors.js';
import type { ShellResult, ShellRunner, ShellRunOptions } from '../types.js';

/** Options for the Windows shell runner. */
export interface WindowsShellRunnerOptions {
  /** The environment. The default is `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** Find the Windows PowerShell program. */
export function findWindowsPowerShell(env: NodeJS.ProcessEnv = process.env): string {
  const systemRoot = env.SystemRoot ?? env.windir;
  if (systemRoot === undefined || systemRoot === '') {
    throw new PlatformError('Cannot find the Windows folder.', {
      hint: 'Check the SystemRoot environment variable.',
    });
  }

  const pathParts = [systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'];
  return pathParts.join('\\');
}

/** Run a program and pass input through stdin. */
export class WindowsShellRunner implements ShellRunner {
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: WindowsShellRunnerOptions = {}) {
    this.env = options.env ?? process.env;
  }

  run(
    program: string,
    args: readonly string[],
    options: ShellRunOptions = {},
  ): Promise<ShellResult> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    return new Promise<ShellResult>((resolve, reject) => {
      const child = spawn(program, [...args], {
        env: this.env,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill();
        reject(
          new PlatformError(`The program took longer than ${timeoutMs} ms: ${program}`, {
            hint: 'Close the programs that use the file and try again.',
          }),
        );
      }, timeoutMs);

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });

      child.on('error', (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(
          new PlatformError(`Cannot start the program: ${program}`, {
            hint: 'Check that the program exists.',
            cause: error,
          }),
        );
      });

      child.on('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: code ?? -1 });
      });

      if (options.input !== undefined) {
        child.stdin.end(options.input, 'utf8');
      } else {
        child.stdin.end();
      }
    });
  }
}
