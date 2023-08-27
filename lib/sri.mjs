const algoFromSRI = new Map([
  ['sha1', 'SHA-1'],
  ['sha512', 'SHA-512'],
  ['sha384', 'SHA-384'],
  ['sha256', 'SHA-256'],
]);

const validatedBody = async (integrity, body) => {
  body = new Blob(body);

  if (!integrity)
    return body;

  // this is far from spec compliance
  const [algo, sign] = integrity.trim().split('-');
  const hash = Buffer.from(await crypto.subtle.digest(
    algoFromSRI.get(algo.toLowerCase()) ?? algo,
    await body.arrayBuffer()
  )).toString('base64');
  if (sign !== hash)
    throw new TypeError('Integrity mismatch');
  return body;
};

export {
  validatedBody,
};
