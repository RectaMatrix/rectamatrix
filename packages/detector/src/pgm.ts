import type { ImageDataLike } from "./types.js";

export function parsePortableGraymap(bytes: Uint8Array): ImageDataLike {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("Portable Graymap input must be a Uint8Array.");
  }
  let offset = 0;
  const magic = readToken(
    bytes,
    () => offset,
    (value) => {
      offset = value;
    },
  );
  if (magic !== "P5") {
    throw new RangeError(
      "Only binary P5 Portable Graymap images are supported.",
    );
  }
  const width = parsePositiveInteger(
    readToken(
      bytes,
      () => offset,
      (value) => {
        offset = value;
      },
    ),
    "width",
  );
  const height = parsePositiveInteger(
    readToken(
      bytes,
      () => offset,
      (value) => {
        offset = value;
      },
    ),
    "height",
  );
  const maximum = parsePositiveInteger(
    readToken(
      bytes,
      () => offset,
      (value) => {
        offset = value;
      },
    ),
    "maximum sample",
  );
  if (maximum !== 255) {
    throw new RangeError("Portable Graymap maximum sample must be 255.");
  }
  if (offset >= bytes.length || !isWhitespace(bytes[offset]!)) {
    throw new RangeError("Portable Graymap header is not terminated.");
  }
  offset += 1;
  const pixelCount = width * height;
  if (
    !Number.isSafeInteger(pixelCount) ||
    bytes.length - offset !== pixelCount
  ) {
    throw new RangeError(
      "Portable Graymap pixel data length does not match its dimensions.",
    );
  }
  const data = new Uint8ClampedArray(pixelCount * 4);
  for (let index = 0; index < pixelCount; index += 1) {
    const value = bytes[offset + index]!;
    const target = index * 4;
    data[target] = value;
    data[target + 1] = value;
    data[target + 2] = value;
    data[target + 3] = 255;
  }
  return Object.freeze({ width, height, data });
}

function readToken(
  bytes: Uint8Array,
  getOffset: () => number,
  setOffset: (offset: number) => void,
): string {
  let offset = getOffset();
  while (offset < bytes.length) {
    if (bytes[offset] === 0x23) {
      while (offset < bytes.length && bytes[offset] !== 0x0a) offset += 1;
    } else if (isWhitespace(bytes[offset]!)) {
      offset += 1;
    } else {
      break;
    }
  }
  const start = offset;
  while (
    offset < bytes.length &&
    !isWhitespace(bytes[offset]!) &&
    bytes[offset] !== 0x23
  ) {
    offset += 1;
  }
  if (offset === start) {
    throw new RangeError("Portable Graymap header is truncated.");
  }
  setOffset(offset);
  return String.fromCharCode(...bytes.slice(start, offset));
}

function parsePositiveInteger(token: string, name: string): number {
  if (!/^[1-9][0-9]*$/u.test(token)) {
    throw new RangeError(`Portable Graymap ${name} must be positive.`);
  }
  const value = Number(token);
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Portable Graymap ${name} is too large.`);
  }
  return value;
}

function isWhitespace(value: number): boolean {
  return value === 0x20 || value === 0x09 || value === 0x0a || value === 0x0d;
}
