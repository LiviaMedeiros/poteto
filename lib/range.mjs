import { open, readFile } from 'node:fs/promises';
import {
  responseConstructor,
} from './generic.mjs';
import {
  validatedBody,
} from './sri.mjs';
import {
  genericResponse,
  getRanges,
  statsAsOptions,
} from './http.mjs';

const rangeToFSOpts = (range, size = Infinity) => {
  size = Number(size);

  let [start, end] = range.split('-').map($ => $ === '' ? null : Number($));
  start ?? (end === null
    ? start = 0
    : (start = size - end, end = size - 1)
  );
  end ??= size - 1;

  if (end > size - 1)
    throw new RangeError(`end (${end}) exceeds size (${size}) - 1`);
  if (start < 0)
    throw new RangeError(`start (${start}) less than 0`);
  if (start > end)
    throw new RangeError(`start (${start}) more than end (${end})`);

  return { length: end - start + 1, position: start };
};

const readByteRanges = async (url, ranges, size, fd) => {
  try {
    fd ??= await open(url);

    return Promise.all(ranges.map(range => {
      const { length, position } = rangeToFSOpts(range, size);

      return fd.read(new Uint8Array(length), {
        length,
        position,
      }).then(({ buffer }) => buffer);
    }));
  } finally {
    await fd?.close();
  }
};

const readRanges = async (url, { headers, integrity, signal }, stats) => {
  const { unit, ranges } = getRanges(headers);

  switch (unit) {
  case 'bytes':
    return readByteRanges(url, ranges, stats.size)
      .then($ => validatedBody(integrity, $))
      .then(
        async body => [
          body,
          await statsAsOptions(
            {...stats, size: BigInt(body.byteLength) },
            { status: 206 }
          ),
        ]
      )
      .then(responseConstructor)
      .catch($ => $ instanceof RangeError
        ? genericResponse(416)
        : Promise.reject($)
      );
  case 'none':
    return Promise.all([
      readFile(url, { signal }).then($ => validatedBody(integrity, [$])),
      statsAsOptions(stats),
    ]).then(responseConstructor);
  default:
    return genericResponse(416);
  }
};

const writeByteRange = async (url, range, body, flag) => {
  let { length, position } = rangeToFSOpts(range);

  let fd;
  try {
    fd = await open(url, flag);
    for await (const $ of body) {
      const byteLength = Math.min($.byteLength ?? $.length, length);
      await fd.write(...ArrayBuffer.isView($)
        ? [new Uint8Array($.buffer, $.byteOffset, byteLength),,, position]
        : [`${$}`.slice(0, byteLength), position]
      );

      if (!(length -= byteLength))
        return;
      position += byteLength;
    }
  } finally {
    await fd?.close();
  }
};

export {
  readByteRanges,
  readRanges,
  writeByteRange,
};
