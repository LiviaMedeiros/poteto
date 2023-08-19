#!/usr/bin/env node
import poteto from '../index.mjs?persistCwd=true';

const printResponse = async ({ ok, body }) => {
  for await (const $ of body)
    process[ok ? 'stdout' : 'stderr'].write($);
}

const [,,...urls] = process.argv;

// chunks from different files may come in arbitrary order
// low memory footprint
// READ method will be used even for remote addresses
// eslint-disable-next-line no-unused-vars
const catConcurrent = urls =>
  Promise.all(urls.map(url =>
    poteto(url, { method: 'READ' }).then(printResponse)
  ));

// everything comes in order
// each local file loaded in memory
// GET method for all
const catOrder = async urls => {
  for (const url of urls)
    await poteto(url).then(printResponse);
    //await printResponse(await poteto(url));
}

await catOrder(urls);
//await catConcurrent(urls);
