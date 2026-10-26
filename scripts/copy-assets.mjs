import { cp, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const assets = [
  {
    from: path.join('src', 'platform', 'windows'),
    to: path.join('dist', 'platform', 'windows'),
    pattern: /\.ps1$/,
  },
  {
    from: path.join('src', 'store', 'migrations'),
    to: path.join('dist', 'store', 'migrations'),
    pattern: /\.sql$/,
  },
];

for (const asset of assets) {
  const source = path.join(root, asset.from);
  const target = path.join(root, asset.to);
  await mkdir(target, { recursive: true });

  for (const name of await readdir(source)) {
    if (asset.pattern.test(name)) {
      await cp(path.join(source, name), path.join(target, name));
    }
  }
}
