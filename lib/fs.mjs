import { open } from 'node:fs/promises';

const rangeToFSOpts = (range, size = Infinity) => {
  size = Number(size);
  let [start, end] = range.split('-').map($ => $ === '' ? null : Number($));
  end ??= size - 1;
  start ?? (start = size - end, end = size - 1);

  if (end > size - 1)
    throw new RangeError(`end (${end}) exceeds size (${size}) - 1`);
  if (start < 0)
    throw new RangeError(`start (${start}) less than 0`);
  if (start > end)
    throw new RangeError(`start (${start}) more than end (${end})`);

  return { length: end - start + 1, position: start };
};

const readRange = async (range, size, url) => {
  const { length, position } = rangeToFSOpts(range, size);

  let fd;
  try {
    fd = await open(url);
    return fd.read(new Uint8Array(length), {
      length,
      position,
    }).then(({ buffer }) => buffer);
  } finally {
    await fd?.[Symbol.asyncDispose]();
  }
};

const writeRange = async (range, url, body, mode = 'r+') => {
  let { length, position } = rangeToFSOpts(range);

  let fd;
  try {
    fd = await open(url, mode);
    for await (const chunk of body) {
      const { byteLength } = chunk;
      await fd.write(chunk, {
        length: Math.min(byteLength, length),
        position,
      });

      if ((length -= byteLength) < 0)
        return;
      position += byteLength;
    }
  } finally {
    await fd?.[Symbol.asyncDispose]();
  }
};

export {
  readRange,
  writeRange,
};
