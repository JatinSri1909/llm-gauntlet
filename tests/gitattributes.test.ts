import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gitattributesPath = path.join(repoRoot, '.gitattributes');

function parseRules(contents: string): Map<string, string[]> {
  const rules = new Map<string, string[]>();

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    const [pattern, ...attributes] = trimmed.split(/\s+/);
    if (pattern === undefined) {
      continue;
    }

    rules.set(pattern, attributes);
  }

  return rules;
}

const rules = parseRules(readFileSync(gitattributesPath, 'utf8'));

function attributesFor(pattern: string): string[] {
  const attributes = rules.get(pattern);
  if (attributes === undefined) {
    throw new Error(`.gitattributes has no rule for ${pattern}`);
  }

  return attributes;
}

describe('.gitattributes line endings', () => {
  it('uses CRLF for PowerShell scripts', () => {
    expect(attributesFor('*.ps1')).toContain('eol=crlf');
  });

  it('uses CRLF for command scripts', () => {
    expect(attributesFor('*.cmd')).toContain('eol=crlf');
  });

  it('uses LF for TypeScript files', () => {
    expect(attributesFor('*.ts')).toContain('eol=lf');
  });

  it('uses LF for Markdown files', () => {
    expect(attributesFor('*.md')).toContain('eol=lf');
  });
});
