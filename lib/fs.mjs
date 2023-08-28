import { open } from 'node:fs/promises';

const rangeToFSOpts = (range, size = Infinity) => {
  size = Number(size);

  let [start, end] = range.split('-').map($ => $ === '' ? null : Number($));
  end ??= size - 1;
  start ?? (start = size - end || 0, end = size - 1);

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
    await fd?.close();
  }
};

const writeRange = async (range, url, body, flag) => {
  let { length, position } = rangeToFSOpts(range);

  let fd;
  try {
    fd = await open(url, flag);
    for await (const $ of body) {
      await fd.write(...ArrayBuffer.isView($)
        ? [$.slice(0, length), undefined, undefined, position]
        : [`${$}`.slice(0, length), position]
      );

      if ((length -= $.length) <= 0)
        return;
      position += $.length;
    }
  } finally {
    await fd?.close();
  }
};

export {
  readRange,
  writeRange,
};
