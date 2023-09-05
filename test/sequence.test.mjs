import { chdir } from 'node:process';
import { fileURLToPath } from 'node:url';
import poteto from '../index.mjs';
import assert from 'node:assert';
import test from 'node:test';

const isDeno = 'Deno' in globalThis;

chdir(fileURLToPath(new URL('../testdir/sequence/', import.meta.url)));

let _i = 0;
const textEncoder = new TextEncoder();
const getNumber = () => [
  () => `${_i++}`,
  () => textEncoder.encode(`${_i++}`),
  () => `${_i}`.length % 2
    ? textEncoder.encode(`${_i++}`)
    : new Uint16Array(textEncoder.encode(`${_i++}`).buffer),
  () => `${_i}`.length % 2
    ? textEncoder.encode(`${_i++}`)
    : new Int16Array(textEncoder.encode(`${_i++}`).buffer),
][Math.floor(Math.random() * 4)]();

const bodygen = (n = 10, pause = 9, $ = null) =>
  new ReadableStream({
    start: _ =>
      $ ??= setInterval(
        () => n--
          ? _.enqueue(getNumber())
          : (_.close(), clearInterval($)),
        pause
      ),
    cancel: () => clearInterval($),
  });

const validate = (actual, expected = {}, headers = {}) => {
  assert.ok(actual instanceof Response, `${actual} is not Response`);

  const ago = new Date() - new Date(actual.headers.get('Date'));
  assert.ok(ago >= 0, `got Date ${ago} ms in future`);
  assert.ok(ago <= 9999, `got Date ${ago} ms ago`);

  assert.strictEqual(actual.headers.get('Server'), 'poteto');

  Object.entries(expected).forEach(([key, value]) =>
    assert.strictEqual(actual[key], value)
  );

  Object.entries(headers).forEach(([key, value]) =>
    assert.strictEqual(actual.headers.get(key), value)
  );
};

const filename = `deleteme-${Math.random()}`;

const _ = ($ = filename) => [
  filename => filename,
  filename => `./${filename}`,
  filename => `file:${filename}`,
  filename => `file:./${filename}`,
  filename => new URL(`../testdir/sequence/./${filename}`, import.meta.url),
  filename => new URL(`../testdir/sequence/./${filename}`, import.meta.url).href,
  filename => new Request(new URL(`../testdir/sequence/./${filename}`, import.meta.url)),
  filename => new Request(new URL(`../testdir/sequence/./${filename}`, import.meta.url).href),
][Math.floor(Math.random() * 8)]($);

test('sequence', async t => {
  const pastDate = new Date();
  let resp;
  let text;
  let json;
  let body;
  let etag;

  resp = await poteto('', { method: 'LIST' });
  validate(resp, { status: 200 }, { 'content-type': 'application/json' });
  json = await resp.json();
  assert.ok(!json.includes(filename));

  resp = await poteto(_());
  validate(resp, { status: 404 }, { 'x-poteto-code': 'ENOENT' });

  resp = await poteto(_(), { method: 'HEAD' });
  validate(resp, { status: 404, body: null }, { 'x-poteto-code': 'ENOENT' });
  body = resp.body;
  assert.strictEqual(body, null);
  text = await resp.text();
  assert.strictEqual(text, '');

  resp = await poteto(_(), { method: 'DELETE' });
  validate(resp, { status: 404 }, { 'x-poteto-code': 'ENOENT' });

  resp = await poteto(_(), { method: 'DELETE', headers: { 'Accept': 'application/json' } });
  validate(resp, { status: 404 }, { 'x-poteto-code': 'ENOENT' });
  json = await resp.json();
  assert.strictEqual(json.code, 'ENOENT');

  resp = await poteto(_(), { body: 'test', method: 'POST' });
  validate(resp, { status: 404 });

  resp = await poteto(_());
  validate(resp, { status: 404 });

  resp = await poteto(_(), { body: 'test', method: 'PUT' });
  validate(resp, { status: 201, body: null });

  // integrity is ignored by Request constructor
  if (!isDeno)
    assert.rejects(
      poteto(_(), { integrity: 'sha512-qUqP5cyxm6YcTAhz05Hph5gvu9M=' }),
      TypeError,
    );

  resp = await poteto(_(), { integrity: 'sha1-qUqP5cyxm6YcTAhz05Hph5gvu9M=' });
  validate(resp, { status: 200 }, { 'x-poteto-size': '4' });
  text = await resp.text();
  assert.strictEqual(text, 'test');
  etag = resp.headers.get('ETag');
  assert.match(etag, /^W\/"\w+-\w+-4-\w+"$/);

  resp = await poteto(_(), { body: bodygen(), method: 'PUT', duplex: 'half' });
  validate(resp, { status: 201, body: null });

  resp = await poteto(_(), { integrity: 'sha384-kK5THyTkhpeQSk0ChvNUxQo1DrtsK578si9xyWzq7/wRxglenKDfDsML9oXc8uXl' });
  validate(resp, { status: 200 }, { 'x-poteto-size': '10' });
  text = await resp.text();
  assert.strictEqual(text, '0123456789');
  assert.notStrictEqual(resp.headers.get('ETag'), etag);
  etag = resp.headers.get('ETag');
  assert.match(etag, /^W\/"\w+-\w+-a-\w+"$/);

  resp = await poteto(_(), { headers: { 'If-None-Match': 'W/"abc-def-mep-ope"' } });
  validate(resp, { status: 200 }, { 'x-poteto-size': '10' });
  text = await resp.text();
  assert.strictEqual(text, '0123456789');
  assert.strictEqual(resp.headers.get('ETag'), etag);

  resp = await poteto(_(), { headers: { 'If-None-Match': etag } });
  validate(resp, { status: 304, body: null });
  assert.strictEqual(resp.headers.get('ETag'), etag);

  resp = await poteto(_(), { headers: { 'If-Match': 'W/"abc-def-mep-ope"' } });
  validate(resp, { status: 412, body: null }, { 'x-poteto-size': '10' });
  assert.strictEqual(resp.headers.get('ETag'), etag);

  resp = await poteto(_(), { headers: { 'If-Match': etag } });
  validate(resp, { status: 200 }, { 'x-poteto-size': '10' });
  text = await resp.text();
  assert.strictEqual(text, '0123456789');
  assert.strictEqual(resp.headers.get('ETag'), etag);

  // TODO: investigate issue with fd.read()
  if (!isDeno) {
    resp = await poteto(_(), { headers: { 'Range': 'bytes=1-3,5-5,7-8'} });
    validate(resp, { status: 206 }, { 'x-poteto-size': '6' });
    text = await resp.text();
    assert.strictEqual(text, '123578');

    resp = await poteto(_(), { headers: { 'Range': 'bytes=1-2,4-5,7-7'}, integrity: 'sha1-db3ms9F0w5Sozo0ZTj6GiLCmM+A=' });
    validate(resp, { status: 206 }, { 'x-poteto-size': '5' });
    text = await resp.text();
    assert.strictEqual(text, '12457');

    resp = await poteto(_(), { headers: { 'Range': 'bytes=5-'} });
    validate(resp, { status: 206 }, { 'x-poteto-size': '5' });
    text = await resp.text();
    assert.strictEqual(text, '56789');

    resp = await poteto(_(), { headers: { 'Range': 'bytes=-3'} });
    validate(resp, { status: 206 }, { 'x-poteto-size': '3' });
    text = await resp.text();
    assert.strictEqual(text, '789');
  }

  resp = await poteto(_(), { headers: { 'Range': 'bytes=99-999'} });
  validate(resp, { status: 416 });

  resp = await poteto(_(), { headers: { 'Range': 'bytes=5-3'} });
  validate(resp, { status: 416 });

  resp = await poteto(_(), { method: 'DELETE' });
  validate(resp, { status: 204, body: null });

  resp = await poteto(_(), { headers: { 'Range': 'bytes=1-2,4-5,7-7'}, integrity: 'sha1-db3ms9F0w5Sozo0ZTj6GiLCmM+A=' });
  validate(resp, { status: 404 });

  resp = await poteto(_(), { body: 'test', method: 'WRITE' });
  validate(resp, { status: 201, body: null });

  resp = await poteto(_(), { method: 'WRITE' });
  validate(resp, { status: 422 });

  resp = await poteto(_(), { integrity: 'sha512-7iaw3Ur350mqGo7jwQrpkj9hiYB3Lkc/iBml1JQODbJ6wYX4oOHV+E+IvIh/1nsUNzLDBMxfqa2Ob1f1ACio/w==' });
  validate(resp, { status: 200 }, { 'x-poteto-size': '4' });
  text = await resp.text();
  assert.strictEqual(text, 'test');

  resp = await poteto(_(), { body: bodygen(), method: 'WRITE', duplex: 'half' });
  validate(resp, { status: 201, body: null });

  resp = await poteto(`${_()}${'a'.repeat(2 ** 16)}`, { headers: { 'Accept': 'application/json' } });
  validate(resp, { status: 400 }, { 'x-poteto-code': 'ENAMETOOLONG' });
  json = await resp.json();
  assert.strictEqual(json.code, 'ENAMETOOLONG');

  resp = await poteto(_(), { integrity: 'sha256-uvThdKYK8fCnhkKy2981+29g4O/6OEoSLNsi/VXPIWU=' });
  validate(resp, { status: 200 }, { 'x-poteto-size': '20' });
  text = await resp.text();
  assert.strictEqual(text, '10111213141516171819');

  resp = await poteto(_(), { body: 'test', method: 'PUT' });
  validate(resp, { status: 201, body: null });

  resp = await poteto(_(), { method: 'PUT' });
  validate(resp, { status: 422, body: null });

  resp = await poteto(_(), { method: isDeno ? 'GET' : 'READ' });
  validate(resp, { status: 200 }, { 'x-poteto-size': '4' });
  text = await resp.text();
  assert.strictEqual(text, 'test');

  resp = await poteto(_(), { body: bodygen(), method: 'WRITE', duplex: 'half' });
  validate(resp, { status: 201, body: null });

  resp = await poteto(_(), { method: isDeno ? 'GET' : 'READ' });
  validate(resp, { status: 200 }, { 'x-poteto-size': '20' });
  text = await resp.text();
  assert.strictEqual(text, '20212223242526272829');

  resp = await poteto(_(), { headers: { 'If-Modified-Since': new Date(+pastDate - 9e3).toUTCString() } });
  validate(resp, { status: 200 }, { 'Content-Length': '20' });
  text = await resp.text();
  assert.strictEqual(text, '20212223242526272829');

  resp = await poteto(_(), { headers: { 'If-Modified-Since': new Date(+new Date() + 9e3).toUTCString() } });
  validate(resp, { status: 304, body: null }, { 'Content-Length': '20' });

  resp = await poteto(_(), { headers: { 'If-Unmodified-Since': new Date(+pastDate - 9e3).toUTCString() } });
  validate(resp, { status: 412, body: null });

  resp = await poteto(_(), { headers: { 'If-Unmodified-Since': new Date(+new Date() + 9e3).toUTCString() } });
  validate(resp, { status: 200 }, { 'Content-Length': '20' });
  text = await resp.text();
  assert.strictEqual(text, '20212223242526272829');

  // fs.fileAppend doesn't work with ReadableStream
  await t.test('further sequence', { skip: isDeno && 'not supported in Deno yet' }, async () => {
    resp = await poteto(_(), { body: bodygen(), method: 'APPEND', duplex: 'half' });
    validate(resp, { status: 201, body: null });

    resp = await poteto(_(), { method: 'APPEND', duplex: 'half' });
    validate(resp, { status: 422, body: null });

    resp = await poteto(_(), { method: isDeno ? 'GET' : 'READ' });
    validate(resp, { status: 200 }, { 'x-poteto-size': '40' });
    text = await resp.text();
    assert.strictEqual(text, '2021222324252627282930313233343536373839');

    resp = await poteto('', { method: 'LIST' });
    validate(resp, { status: 200 }, { 'content-type': 'application/json' });
    json = await resp.json();
    assert.ok(json.includes(filename));

    resp = await poteto(_(), { method: 'HEAD' });
    validate(resp, { status: 200 }, { 'x-poteto-size': '40' });
    body = resp.body;
    assert.strictEqual(body, null);
    text = await resp.text();
    assert.strictEqual(text, '');

    resp = await poteto(_(), { method: 'OPTIONS' });
    validate(resp, { status: 501, body: null });

    await assert.rejects(poteto(_(), { method: 'CONNECT' }), TypeError);
    await assert.rejects(poteto(_(), { method: 'TRACE' }), TypeError);
    await assert.rejects(poteto(_(), { method: 'TRACK' }), TypeError);

    resp = await poteto(_(), { method: 'METHODNOTEXISTS' });
    validate(resp, { status: 405, body: null });

    {
      resp = await poteto(_(), { method: 'READ' });
      validate(resp, { status: 200 }, { 'x-poteto-size': '40' });
      body = resp.body;
      const reader = body.getReader({ mode: 'byob' });

      let buffer;
      let result;

      buffer = new Uint8Array(24);
      result = await reader.read(buffer);
      assert.strictEqual(result.value.toString(), '50,48,50,49,50,50,50,51,50,52,50,53,50,54,50,55,50,56,50,57,51,48,51,49');
      assert.strictEqual(result.done, false);

      buffer = new Uint8Array(24);
      result = await reader.read(buffer);
      assert.strictEqual(result.value.toString(), '51,50,51,51,51,52,51,53,51,54,51,55,51,56,51,57');
      assert.strictEqual(result.done, false);

      buffer = new Uint8Array(24);
      result = await reader.read(buffer);
      assert.strictEqual(result.value.toString(), '');
      assert.strictEqual(result.done, true);
    }

    resp = await poteto(_(), { method: 'POST', body: bodygen(999), headers: { 'Range': 'bytes=5-15' }, duplex: 'half' });
    validate(resp, { status: 201, body: null });

    resp = await poteto(_());
    validate(resp, { status: 200 }, { 'x-poteto-size': '40' });
    text = await resp.text();
    assert.strictEqual(text, '2021240414243444282930313233343536373839');

    resp = await poteto(_(), { method: 'POST', body: bodygen(), headers: { 'Range': 'bytes=27-' }, duplex: 'half' });
    validate(resp, { status: 201, body: null });

    resp = await poteto(_());
    validate(resp, { status: 200 }, { 'x-poteto-size': '47' });
    text = await resp.text();
    assert.strictEqual(text, '20212404142434442829303132346474849505152535455');

    resp = await poteto(_(), { method: 'PUT', body: bodygen(), headers: { 'Range': 'bytes=3-15' }, duplex: 'half' });
    validate(resp, { status: 201, body: null });

    resp = await poteto(_());
    validate(resp, { status: 200 }, { 'x-poteto-size': '16' });
    text = await resp.text();
    assert.strictEqual(text, '\x00\x00\x005657585960616');
  });

  await new Promise(_ => setTimeout(_, 9));

  resp = await poteto(_(), { method: 'DELETE' });
  validate(resp);
});
