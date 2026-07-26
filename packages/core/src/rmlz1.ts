import { RectaMatrixError } from "./errors.js";
import { RM_LZ1_LIMITS } from "./generated/spec-constants.js";

interface Match {
  readonly distance: number;
  readonly length: number;
}

export function rmlz1Encode(input: Uint8Array): Uint8Array {
  const output: number[] = [];
  let position = 0;

  while (position < input.length) {
    const flagIndex = output.length;
    output.push(0);
    let flags = 0;

    for (
      let tokenIndex = 0;
      tokenIndex < RM_LZ1_LIMITS.tokensPerGroup && position < input.length;
      tokenIndex += 1
    ) {
      const match = findBestMatch(input, position);
      if (match === undefined) {
        output.push(input[position]!);
        position += 1;
      } else {
        flags |= 1 << tokenIndex;
        const distanceMinus1 = match.distance - 1;
        output.push(distanceMinus1 >>> 4);
        output.push(
          ((distanceMinus1 & 0x0f) << 4) |
            (match.length - RM_LZ1_LIMITS.minimumMatchLength),
        );
        position += match.length;
      }
    }

    output[flagIndex] = flags;
  }

  return Uint8Array.from(output);
}

export function rmlz1Decode(
  input: Uint8Array,
  originalLength: number,
): Uint8Array {
  if (
    !Number.isInteger(originalLength) ||
    originalLength < 0 ||
    originalLength > 0xffff
  ) {
    throw new RangeError("Original length must be an unsigned 16-bit integer.");
  }
  if (originalLength === 0) {
    if (input.length !== 0) {
      throw decompressionError(
        "Empty output must have an empty RM-LZ1 stream.",
      );
    }
    return new Uint8Array();
  }

  const output = new Uint8Array(originalLength);
  let outputLength = 0;
  let inputOffset = 0;

  while (outputLength < originalLength) {
    if (inputOffset >= input.length) {
      throw decompressionError(
        "RM-LZ1 input ended before the declared output length.",
      );
    }
    const flags = input[inputOffset]!;
    inputOffset += 1;

    for (
      let tokenIndex = 0;
      tokenIndex < RM_LZ1_LIMITS.tokensPerGroup;
      tokenIndex += 1
    ) {
      if (outputLength === originalLength) {
        const unusedMask = (0xff << tokenIndex) & 0xff;
        if ((flags & unusedMask) !== 0) {
          throw decompressionError("Unused final flag bits must be zero.");
        }
        if (inputOffset !== input.length) {
          throw decompressionError(
            "Trailing RM-LZ1 token bytes are not permitted.",
          );
        }
        return output;
      }

      if (((flags >>> tokenIndex) & 1) === 0) {
        if (inputOffset >= input.length) {
          throw decompressionError("RM-LZ1 literal is truncated.");
        }
        output[outputLength] = input[inputOffset]!;
        outputLength += 1;
        inputOffset += 1;
      } else {
        if (inputOffset + 2 > input.length) {
          throw decompressionError("RM-LZ1 match is truncated.");
        }
        const byteA = input[inputOffset]!;
        const byteB = input[inputOffset + 1]!;
        inputOffset += 2;
        const distance = ((byteA << 4) | (byteB >>> 4)) + 1;
        const length = (byteB & 0x0f) + RM_LZ1_LIMITS.minimumMatchLength;

        if (
          distance < RM_LZ1_LIMITS.minimumDistance ||
          distance > RM_LZ1_LIMITS.maximumDistance ||
          distance > outputLength
        ) {
          throw decompressionError("RM-LZ1 match distance is invalid.");
        }
        if (outputLength + length > originalLength) {
          throw decompressionError(
            "RM-LZ1 match exceeds the declared output length.",
          );
        }
        for (let index = 0; index < length; index += 1) {
          output[outputLength] = output[outputLength - distance]!;
          outputLength += 1;
        }
      }
    }
  }

  if (inputOffset !== input.length) {
    throw decompressionError("Trailing RM-LZ1 token bytes are not permitted.");
  }
  return output;
}

function findBestMatch(input: Uint8Array, position: number): Match | undefined {
  const maximumDistance = Math.min(position, RM_LZ1_LIMITS.maximumDistance);
  const maximumLength = Math.min(
    input.length - position,
    RM_LZ1_LIMITS.maximumMatchLength,
  );
  let bestLength = 0;
  let bestDistance = 0;

  for (let distance = 1; distance <= maximumDistance; distance += 1) {
    let length = 0;
    while (
      length < maximumLength &&
      input[position + length] === input[position + length - distance]
    ) {
      length += 1;
    }
    if (length > bestLength) {
      bestLength = length;
      bestDistance = distance;
    }
  }

  return bestLength >= RM_LZ1_LIMITS.minimumMatchLength
    ? { distance: bestDistance, length: bestLength }
    : undefined;
}

function decompressionError(message: string): RectaMatrixError {
  return new RectaMatrixError("DECOMPRESSION_FAILURE", message);
}
