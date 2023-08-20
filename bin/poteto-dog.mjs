#!/usr/bin/env node
import poteto from '../index.mjs?persistCwd=true';

const printResponse = async ({ ok, body }) => {
  for await (const $ of body)
    process[ok ? 'stdout' : 'stderr'].write($);
};

const [,, ...urls] = process.argv;

// chunks from different files may come in arbitrary order
// low memory footprint
// READ method will be used even for remote addresses
await Promise.all(urls.map(url =>
  poteto(url, { method: 'READ' }).then(printResponse)
));
