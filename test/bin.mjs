import { platform } from 'node:process';
import assert from 'node:assert';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

const cwd = new URL('.', import.meta.url);

const _ = $ => [
  filename => filename,
  filename => `./${filename}`,
  filename => `file:${filename}`,
  filename => `file:./${filename}`,
  filename => new URL(`./${filename}`, import.meta.url),
  filename => new URL(`./${filename}`, import.meta.url).href,
][Math.floor(Math.random() * 6)]($);

test('cat', async () => {
  const nativeCat = platform === 'win32' ? 'type' : 'cat';

  assert.deepStrictEqual(
    execFileSync(
      '../bin/poteto-cat.mjs',
      ['../LICENSE', '../README.md', '../package.json'].map(_),
      { cwd }
    ),
    execFileSync(
      nativeCat,
      ['../LICENSE', '../README.md', '../package.json'],
      { cwd }
    ),
  );
});

test('dog', async () => {
  const nativeCat = platform === 'win32' ? 'type' : 'cat';

  assert.deepStrictEqual(
    execFileSync(
      '../bin/poteto-dog.mjs',
      ['../LICENSE', '../README.md', '../package.json'].map(_),
      { cwd }
    ).length,
    execFileSync(
      nativeCat,
      ['../LICENSE', '../README.md', '../package.json'],
      { cwd }
    ).length,
  );

  assert.deepStrictEqual(
    execFileSync(
      '../bin/poteto-dog.mjs',
      ['../LICENSE'].map(_),
      { cwd }
    ).length,
    execFileSync(
      nativeCat,
      ['../LICENSE'],
      { cwd }
    ).length,
  );
});
