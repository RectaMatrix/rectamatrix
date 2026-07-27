const MAX_ORIGINAL_LENGTH = 0xffff;

export interface DecodedLengthPrefix {
  readonly value: number;
  readonly bytesRead: number;
}

/** Encodes a v2 original-length prefix as canonical unsigned LEB128. */
export function encodeOriginalLengthPrefix(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > MAX_ORIGINAL_LENGTH) {
    throw new RangeError(
      "Original Payload length must fit in unsigned 16 bits.",
    );
  }
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0);
  return Uint8Array.from(bytes);
}

/** Decodes a canonical, bounded v2 unsigned LEB128 original-length prefix. */
export function decodeOriginalLengthPrefix(
  input: Uint8Array,
): DecodedLengthPrefix {
  let value = 0;
  for (let index = 0; index < Math.min(input.length, 3); index += 1) {
    const byte = input[index]!;
    value |= (byte & 0x7f) << (index * 7);
    if ((byte & 0x80) === 0) {
      if (value > MAX_ORIGINAL_LENGTH) {
        throw new RangeError("Original Payload length exceeds v2 limits.");
      }
      const canonical = encodeOriginalLengthPrefix(value);
      if (canonical.length !== index + 1) {
        throw new RangeError(
          "Original Payload length prefix is not canonical.",
        );
      }
      return Object.freeze({ value, bytesRead: index + 1 });
    }
  }
  throw new RangeError(
    "Original Payload length prefix is truncated or invalid.",
  );
}
