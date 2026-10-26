import path from 'node:path';

/** The places where Microsoft Edge is usually installed on Windows. */
export function edgeCandidatePaths(env: NodeJS.ProcessEnv): string[] {
  const roots = [env['ProgramFiles(x86)'], env.ProgramFiles].filter(
    (root): root is string => root !== undefined && root !== '',
  );

  return roots.map((root) => path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
}
