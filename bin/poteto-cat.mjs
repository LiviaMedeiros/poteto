#!/usr/bin/env node
import poteto from '../index.mjs?persistCwd=true';

const printResponse = async ({ ok, body }) => {
  for await (const $ of body)
    process[ok ? 'stdout' : 'stderr'].write($);
};

const [,, ...urls] = process.argv;

// everything comes in order
// each local file loaded in memory
// GET method for all
for (const url of urls)
  await poteto(url).then(printResponse);
