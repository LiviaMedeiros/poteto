import { execPath, platform } from 'node:process';
import assert from 'node:assert';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { sep } from 'node:path';

const cwd = new URL('../testdir/bin/', import.meta.url);
const options = { cwd, shell: true };

const _ = $ => [
  filename => filename,
  filename => `./${filename}`,
  filename => `file:${filename}`,
  filename => `file:./${filename}`,
  filename => new URL(`../testdir/bin/./${filename}`, import.meta.url),
  filename => new URL(`../testdir/bin/./${filename}`, import.meta.url).href,
][Math.floor(Math.random() * 6)]($);

const isWindows = platform === 'win32';

const nodeExecSync = (bin, args, opts = options) =>
  execFileSync(
    ...isWindows
      ? [execPath, [bin, ...args]]
      : [bin, args],
    opts
  );

test('cat', async () => {
  const nativeCat = isWindows ? 'type' : 'cat';

  assert.deepStrictEqual(
    nodeExecSync(
      '../../bin/poteto-cat.mjs',
      ['../../LICENSE', '../../README.md', '../../package.json'].map(_)
    ),
    execFileSync(
      nativeCat,
      [`..${sep}..${sep}LICENSE`, `..${sep}..${sep}README.md`, `..${sep}..${sep}package.json`],
      options
    ),
  );

  assert.deepStrictEqual(
    nodeExecSync(
      '../../bin/poteto-cat.mjs',
      ['../../LICENSE'].map(_)
    ),
    execFileSync(
      nativeCat,
      [`..${sep}..${sep}LICENSE`],
      options
    ),
  );
});

test('dog', async () => {
  const nativeCat = isWindows ? 'type' : 'cat';

  assert.deepStrictEqual(
    nodeExecSync(
      '../../bin/poteto-dog.mjs',
      ['../../LICENSE', '../../README.md', '../../package.json'].map(_)
    ).length,
    execFileSync(
      nativeCat,
      [`..${sep}..${sep}LICENSE`, `..${sep}..${sep}README.md`, `..${sep}..${sep}package.json`],
      options
    ).length,
  );

  assert.deepStrictEqual(
    nodeExecSync(
      '../../bin/poteto-dog.mjs',
      ['../../LICENSE'].map(_)
    ).length,
    execFileSync(
      nativeCat,
      [`..${sep}..${sep}LICENSE`],
      options
    ).length,
  );
});