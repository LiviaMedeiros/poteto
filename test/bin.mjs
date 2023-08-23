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

const potetoExecSync = (bin, args, overrides) =>
  execFileSync(
    ...isWindows
      ? [execPath, [['..', '..', 'bin', `poteto-${bin}.mjs`].join(sep), ...args]]
      : [['..', '..', 'bin', `poteto-${bin}.mjs`].join(sep), args],
    { ...options, ...overrides },
  );

test('cat', async () => {
  const nativeCat = isWindows ? 'type' : 'cat';

  assert.deepStrictEqual(
    potetoExecSync(
      'cat',
      ['../../LICENSE', '../../README.md', '../../package.json'].map(_)
    ),
    execFileSync(
      nativeCat,
      [`..${sep}..${sep}LICENSE`, `..${sep}..${sep}README.md`, `..${sep}..${sep}package.json`],
      options
    ),
  );

  assert.deepStrictEqual(
    potetoExecSync(
      'cat',
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
    potetoExecSync(
      'dog',
      ['../../LICENSE', '../../README.md', '../../package.json'].map(_)
    ).length,
    execFileSync(
      nativeCat,
      [`..${sep}..${sep}LICENSE`, `..${sep}..${sep}README.md`, `..${sep}..${sep}package.json`],
      options
    ).length,
  );

  assert.deepStrictEqual(
    potetoExecSync(
      'dog',
      ['../../LICENSE'].map(_)
    ).length,
    execFileSync(
      nativeCat,
      [`..${sep}..${sep}LICENSE`],
      options
    ).length,
  );
});

test('put-ls-rm', async () => {
  assert.deepStrictEqual(JSON.parse(potetoExecSync(
    'ls',
    []
  )),
  { './': ['.keep'] });

  assert.strictEqual(
    potetoExecSync(
      'put',
      ['poteto'].map(_),
      { input: 'Be saved' }
    ).byteLength,
    0,
  );

  assert.strictEqual(
    potetoExecSync(
      'put',
      ['poteto'].map(_),
      { input: 'Be saved' }
    ).byteLength,
    0,
  );

  assert.deepStrictEqual(JSON.parse(potetoExecSync(
    'ls',
    []
  )),
  { './': ['.keep', 'poteto'] });

  assert.deepStrictEqual(
    potetoExecSync(
      'cat',
      ['poteto'].map(_)
    ),
    Buffer.from('Be saved'),
  );

  assert.strictEqual(
    potetoExecSync(
      'rm',
      ['poteto'].map(_)
    ).byteLength,
    0,
  );

  assert.deepStrictEqual(JSON.parse(potetoExecSync(
    'ls',
    []
  )),
  { './': ['.keep'] });
});
