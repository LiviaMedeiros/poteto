import { chdir } from 'node:process';
import { fileURLToPath } from 'node:url';
import poteto from '../index.mjs?prefix=test';
import assert from 'node:assert';
import test from 'node:test';

chdir(fileURLToPath(new URL('../testdir/redirect/', import.meta.url)));

const _ = $ => [
  filename => filename,
  filename => `./${filename}`,
  filename => new URL(`../testdir/redirect/./${filename}`, import.meta.url),
  filename => new URL(`../testdir/redirect/./${filename}`, import.meta.url).href,
][Math.floor(Math.random() * 4)]($);

test('redirect', async () => {
  let resp;
  let text;
  let json;
  let location;

  resp = await poteto('', { method: 'LIST' });
  json = await resp.json();
  assert.ok(json.includes('target'));
  assert.ok(json.includes('link1'));
  assert.ok(json.includes('link2'));

  resp = await poteto(_('target'), { redirect: 'follow' });
  text = await resp.text();
  assert.strictEqual(text, 'target content');

  resp = await poteto(_('link1'), { redirect: 'follow' });
  text = await resp.text();
  assert.strictEqual(text, 'target content');

  resp = await poteto(_('link2'), { redirect: 'follow' });
  text = await resp.text();
  assert.strictEqual(text, 'target content');

  resp = await poteto(_('target'), { redirect: 'manual' });
  text = await resp.text();
  assert.strictEqual(text, 'target content');

  resp = await poteto(_('link1'), { redirect: 'manual' });
  text = await resp.text();
  assert.strictEqual(text, '');
  location = resp.headers.get('Location');
  assert.strictEqual(location, new URL('../testdir/redirect/target', import.meta.url).href);
  resp = await poteto(location, { redirect: 'manual' });
  text = await resp.text();
  assert.strictEqual(text, 'target content');

  resp = await poteto(_('link2'), { redirect: 'manual' });
  text = await resp.text();
  assert.strictEqual(text, '');
  location = resp.headers.get('Location');
  assert.strictEqual(location, new URL('../testdir/redirect/link1', import.meta.url).href);
  resp = await poteto(location, { redirect: 'manual' });
  text = await resp.text();
  assert.strictEqual(text, '');
  location = resp.headers.get('Location');
  assert.strictEqual(location, new URL('../testdir/redirect/target', import.meta.url).href);
  resp = await poteto(location, { redirect: 'manual' });
  text = await resp.text();
  assert.strictEqual(text, 'target content');

  await assert.rejects(poteto(_('link1'), { redirect: 'error' }), TypeError);

  await assert.rejects(poteto(_('link2'), { redirect: 'error' }), TypeError);
});
