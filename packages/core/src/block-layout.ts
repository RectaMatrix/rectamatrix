import { ECC_PROFILES } from "./generated/spec-constants.js";
import { reedSolomonEncode } from "./reed-solomon.js";
import type { EccLevel } from "./types.js";

export interface RsBlockLayout {
  readonly index: number;
  readonly dataOffset: number;
  readonly dataLength: number;
  readonly parityLength: number;
  readonly totalLength: number;
}

export interface RsLayout {
  readonly frameLength: number;
  readonly eccLevel: EccLevel;
  readonly blockCount: number;
  readonly totalDataBytes: number;
  readonly totalParityBytes: number;
  readonly totalCodewordBytes: number;
  readonly blocks: readonly RsBlockLayout[];
}

export interface EncodedRsBlock {
  readonly index: number;
  readonly data: Uint8Array;
  readonly parity: Uint8Array;
  readonly codeword: Uint8Array;
}

export interface InterleavedCodewordPosition {
  readonly blockIndex: number;
  readonly section: "data" | "parity";
  readonly offset: number;
}

export function calculateParityLength(
  dataLength: number,
  eccLevel: EccLevel,
): number {
  if (!Number.isInteger(dataLength) || dataLength < 1 || dataLength > 255) {
    throw new RangeError(
      "Reed-Solomon block data length must be between 1 and 255.",
    );
  }
  const profile = ECC_PROFILES[eccLevel];
  const ratioParity = Math.ceil(
    (dataLength * profile.numerator) / profile.denominator,
  );
  return Math.max(profile.minimumParity, ratioParity);
}

export function calculateRsLayout(
  frameLength: number,
  eccLevel: EccLevel,
): RsLayout {
  if (
    !Number.isInteger(frameLength) ||
    frameLength < 4 ||
    frameLength > 0xffff + 4
  ) {
    throw new RangeError(
      "RectaMatrix frame length must be between 4 and 65539 bytes.",
    );
  }

  const firstBlockCount = Math.max(1, Math.ceil(frameLength / 255));
  for (
    let blockCount = firstBlockCount;
    blockCount <= frameLength;
    blockCount += 1
  ) {
    const base = Math.floor(frameLength / blockCount);
    const extra = frameLength % blockCount;
    const blocks: RsBlockLayout[] = [];
    let dataOffset = 0;
    let totalParityBytes = 0;
    let valid = true;

    for (let index = 0; index < blockCount; index += 1) {
      const dataLength = base + (index < extra ? 1 : 0);
      const parityLength = calculateParityLength(dataLength, eccLevel);
      const totalLength = dataLength + parityLength;
      if (totalLength > 255) {
        valid = false;
        break;
      }
      blocks.push(
        Object.freeze({
          index,
          dataOffset,
          dataLength,
          parityLength,
          totalLength,
        }),
      );
      dataOffset += dataLength;
      totalParityBytes += parityLength;
    }

    if (valid) {
      return Object.freeze({
        frameLength,
        eccLevel,
        blockCount,
        totalDataBytes: frameLength,
        totalParityBytes,
        totalCodewordBytes: frameLength + totalParityBytes,
        blocks: Object.freeze(blocks),
      });
    }
  }

  throw new RangeError(
    "No valid RectaMatrix Reed-Solomon block layout exists.",
  );
}

export function encodeFrameBlocks(
  frame: Uint8Array,
  eccLevel: EccLevel,
): readonly EncodedRsBlock[] {
  const layout = calculateRsLayout(frame.length, eccLevel);
  return Object.freeze(
    layout.blocks.map((block) => {
      const data = frame.slice(
        block.dataOffset,
        block.dataOffset + block.dataLength,
      );
      const codeword = reedSolomonEncode(data, block.parityLength);
      return Object.freeze({
        index: block.index,
        data,
        parity: codeword.slice(block.dataLength),
        codeword,
      });
    }),
  );
}

export function buildInterleavingMap(
  layout: RsLayout,
): readonly InterleavedCodewordPosition[] {
  const positions: InterleavedCodewordPosition[] = [];
  const maximumDataLength = Math.max(
    ...layout.blocks.map((block) => block.dataLength),
  );
  const maximumParityLength = Math.max(
    ...layout.blocks.map((block) => block.parityLength),
  );

  appendSectionPositions(positions, layout, "data", maximumDataLength);
  appendSectionPositions(positions, layout, "parity", maximumParityLength);

  if (positions.length !== layout.totalCodewordBytes) {
    throw new Error("Internal interleaving-map length mismatch.");
  }
  return Object.freeze(positions);
}

export function interleaveCodewords(
  blocks: readonly EncodedRsBlock[],
  layout: RsLayout,
): Uint8Array {
  validateEncodedBlocks(blocks, layout);
  const result = new Uint8Array(layout.totalCodewordBytes);
  const map = buildInterleavingMap(layout);
  for (let index = 0; index < map.length; index += 1) {
    const position = map[index]!;
    result[index] =
      position.section === "data"
        ? blocks[position.blockIndex]!.data[position.offset]!
        : blocks[position.blockIndex]!.parity[position.offset]!;
  }
  return result;
}

export function deinterleaveCodewords(
  interleaved: Uint8Array,
  layout: RsLayout,
): readonly EncodedRsBlock[] {
  if (interleaved.length !== layout.totalCodewordBytes) {
    throw new RangeError(
      "Interleaved codeword stream has an unexpected length.",
    );
  }
  const data = layout.blocks.map((block) => new Uint8Array(block.dataLength));
  const parity = layout.blocks.map(
    (block) => new Uint8Array(block.parityLength),
  );
  const map = buildInterleavingMap(layout);

  for (let index = 0; index < map.length; index += 1) {
    const position = map[index]!;
    if (position.section === "data") {
      data[position.blockIndex]![position.offset] = interleaved[index]!;
    } else {
      parity[position.blockIndex]![position.offset] = interleaved[index]!;
    }
  }

  return Object.freeze(
    layout.blocks.map((block) => {
      const codeword = new Uint8Array(block.totalLength);
      codeword.set(data[block.index]!);
      codeword.set(parity[block.index]!, block.dataLength);
      return Object.freeze({
        index: block.index,
        data: data[block.index]!,
        parity: parity[block.index]!,
        codeword,
      });
    }),
  );
}

export function reassembleFrame(
  dataBlocks: readonly Uint8Array[],
  layout: RsLayout,
): Uint8Array {
  if (dataBlocks.length !== layout.blockCount) {
    throw new RangeError("Decoded RS block count does not match the layout.");
  }
  const frame = new Uint8Array(layout.frameLength);
  for (const block of layout.blocks) {
    const data = dataBlocks[block.index];
    if (data === undefined || data.length !== block.dataLength) {
      throw new RangeError("Decoded RS data block has an unexpected length.");
    }
    frame.set(data, block.dataOffset);
  }
  return frame;
}

function appendSectionPositions(
  positions: InterleavedCodewordPosition[],
  layout: RsLayout,
  section: "data" | "parity",
  maximumLength: number,
): void {
  for (let offset = 0; offset < maximumLength; offset += 1) {
    for (const block of layout.blocks) {
      const length = section === "data" ? block.dataLength : block.parityLength;
      if (offset < length) {
        positions.push(
          Object.freeze({
            blockIndex: block.index,
            section,
            offset,
          }),
        );
      }
    }
  }
}

function validateEncodedBlocks(
  blocks: readonly EncodedRsBlock[],
  layout: RsLayout,
): void {
  if (blocks.length !== layout.blockCount) {
    throw new RangeError("Encoded RS block count does not match the layout.");
  }
  for (const expected of layout.blocks) {
    const block = blocks[expected.index];
    if (
      block === undefined ||
      block.index !== expected.index ||
      block.data.length !== expected.dataLength ||
      block.parity.length !== expected.parityLength ||
      block.codeword.length !== expected.totalLength
    ) {
      throw new RangeError("Encoded RS block does not match the layout.");
    }
  }
}
