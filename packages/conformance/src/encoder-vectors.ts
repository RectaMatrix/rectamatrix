import {
  encodeBytesWithTrace,
  encodeTextWithTrace,
  type EncoderTrace,
} from "@rectamatrix/encoder";
import { bytesToHex, hexToBytes, uint32ToHex } from "./hex.js";
import type {
  EncoderVector,
  EncoderVectorExpected,
  EncoderVectorInput,
  EncoderVectorOptions,
  EncoderVectorSuite,
} from "./types.js";

export function createEncoderVector(
  id: string,
  input: EncoderVectorInput,
  options: EncoderVectorOptions,
): EncoderVector {
  const trace =
    input.type === "binary"
      ? encodeBytesWithTrace(hexToBytes(input.hex), options)
      : encodeTextWithTrace(input.text, options);
  return Object.freeze({
    id,
    input: Object.freeze({ ...input }),
    options: Object.freeze({ ...options }),
    expected: encoderTraceToExpected(trace),
  });
}

export function createEncoderVectorSuite(
  vectors: readonly EncoderVector[],
): EncoderVectorSuite {
  return Object.freeze({
    format: "rectamatrix-conformance",
    vectorVersion: 1,
    coreVersion: 1,
    kind: "encoder",
    vectors: Object.freeze([...vectors]),
  });
}

export function encoderTraceToExpected(
  trace: EncoderTrace,
): EncoderVectorExpected {
  const { symbol, rsLayout } = trace;
  return Object.freeze({
    sizeId: symbol.sizeId,
    width: symbol.width,
    height: symbol.height,
    payloadType: symbol.payloadType,
    compression: symbol.compression,
    eccLevel: symbol.eccLevel,
    maskId: symbol.maskId,
    originalLength: symbol.originalLength,
    encodedLength: symbol.encodedLength,
    originalPayloadHex: bytesToHex(trace.originalPayload),
    encodedPayloadHex: bytesToHex(trace.encodedPayload),
    crc32cHex: uint32ToHex(trace.crc32c),
    frameHex: bytesToHex(trace.frame),
    headerInformationHex: bytesToHex(trace.headerInformation),
    protectedHeaderHex: bytesToHex(trace.protectedHeader),
    rsBlockCount: rsLayout.blockCount,
    rsTotalDataBytes: rsLayout.totalDataBytes,
    rsTotalParityBytes: rsLayout.totalParityBytes,
    rsTotalCodewordBytes: rsLayout.totalCodewordBytes,
    rsBlocks: Object.freeze(
      trace.rsBlocks.map((block) =>
        Object.freeze({
          index: block.index,
          dataLength: block.data.length,
          parityLength: block.parity.length,
          dataHex: bytesToHex(block.data),
          parityHex: bytesToHex(block.parity),
          codewordHex: bytesToHex(block.codeword),
        }),
      ),
    ),
    interleavedCodewordsHex: bytesToHex(trace.interleavedCodewords),
    unmaskedBodyBits: trace.unmaskedBodyBits
      .map((bit) => (bit ? "1" : "0"))
      .join(""),
    maskScores: Object.freeze(trace.masks.map((mask) => mask.penalty.total)),
    finalMatrix: Object.freeze(
      symbol.matrix.map((row) =>
        row.map((module) => (module ? "1" : "0")).join(""),
      ),
    ),
  });
}
