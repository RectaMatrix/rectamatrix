import { RectaMatrixError } from "./errors.js";
import { encodeUtf8Strict } from "./utf8.js";

const END = 0b000;
const NUMERIC = 0b001;
const ALPHANUMERIC = 0b010;
const LOWER = 0b011;
const UPPER = 0b100;
const URL_TOKEN = 0b101;
const BYTE = 0b110;
const MAXIMUM_SEGMENT_LENGTH = 256;
const MAXIMUM_DECODED_BYTES = 0xffff;

export const RM_HLE1_ALPHANUMERIC_TABLE =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
export const RM_HLE1_LOWER_TABLE = " abcdefghijklmnopqrstuvwxyz.,-_/";
export const RM_HLE1_UPPER_TABLE = " ABCDEFGHIJKLMNOPQRSTUVWXYZ.,-_/";
export const RM_HLE1_URL_TOKENS = Object.freeze([
  "https://",
  "http://",
  "www.",
  ".com",
  ".org",
  ".net",
  ".de",
  "/",
  "?",
  "&",
  "=",
  "#",
  ":",
  ".",
  "-",
  "_",
] as const);

export interface RmHle1Encoding {
  readonly bytes: Uint8Array;
  readonly bitLength: number;
}

interface Choice {
  readonly opcode: number;
  readonly length: number;
  readonly tokenIndex?: number;
}

/** Encodes strict Unicode text using the deterministic RM-HLE1 v2 draft. */
export function rmhle1Encode(text: string): Uint8Array {
  return rmhle1EncodeDetailed(text).bytes;
}

export function rmhle1EncodeDetailed(text: string): RmHle1Encoding {
  if (typeof text !== "string") {
    throw new TypeError("RM-HLE1 input must be a string.");
  }
  encodeUtf8Strict(text);
  const characters = Array.from(text);
  const utf8 = characters.map((character) => encodeUtf8Strict(character));
  const best = Array<number>(characters.length + 1).fill(
    Number.POSITIVE_INFINITY,
  );
  const choices = Array<Choice | undefined>(characters.length);
  best[characters.length] = 3;

  for (let index = characters.length - 1; index >= 0; index -= 1) {
    considerUrlTokens(characters, index, best, choices);
    considerTableMode(
      characters,
      index,
      best,
      choices,
      NUMERIC,
      "0123456789",
      numericPayloadBits,
    );
    considerTableMode(
      characters,
      index,
      best,
      choices,
      ALPHANUMERIC,
      RM_HLE1_ALPHANUMERIC_TABLE,
      alphanumericPayloadBits,
    );
    considerTableMode(
      characters,
      index,
      best,
      choices,
      LOWER,
      RM_HLE1_LOWER_TABLE,
      (length) => length * 5,
    );
    considerTableMode(
      characters,
      index,
      best,
      choices,
      UPPER,
      RM_HLE1_UPPER_TABLE,
      (length) => length * 5,
    );
    let byteLength = 0;
    for (
      let end = index;
      end < characters.length && end - index < MAXIMUM_SEGMENT_LENGTH;
      end += 1
    ) {
      byteLength += utf8[end]!.length;
      if (byteLength > MAXIMUM_SEGMENT_LENGTH) break;
      choose(
        index,
        11 + byteLength * 8 + best[end + 1]!,
        { opcode: BYTE, length: end - index + 1 },
        best,
        choices,
      );
    }
  }

  const writer = new BitWriter();
  for (let index = 0; index < characters.length;) {
    const choice = choices[index];
    if (choice === undefined) {
      throw new Error("Internal RM-HLE1 optimizer failure.");
    }
    writer.write(choice.opcode, 3);
    if (choice.opcode === URL_TOKEN) {
      writer.write(choice.tokenIndex!, 4);
    } else {
      writeSegment(writer, characters, utf8, index, choice);
    }
    index += choice.length;
  }
  writer.write(END, 3);
  return Object.freeze({
    bytes: writer.toBytes(),
    bitLength: writer.bitLength,
  });
}

/** Decodes an RM-HLE1 stream and enforces canonical zero padding. */
export function rmhle1Decode(input: Uint8Array): Uint8Array {
  if (!(input instanceof Uint8Array)) {
    throw new TypeError("RM-HLE1 input must be a Uint8Array.");
  }
  const reader = new BitReader(input);
  const output: number[] = [];
  while (reader.remaining >= 3) {
    const opcode = reader.read(3);
    if (opcode === END) {
      while (reader.remaining > 0) {
        if (reader.read(1) !== 0) throw invalid("Padding bits must be zero.");
      }
      return Uint8Array.from(output);
    }
    if (opcode === URL_TOKEN) {
      appendAscii(output, RM_HLE1_URL_TOKENS[reader.read(4)]!);
      enforceOutputLimit(output.length);
      continue;
    }
    if (opcode === 0b111) throw invalid("Reserved segment opcode.");
    const length = reader.read(8) + 1;
    if (opcode === NUMERIC) {
      decodeNumeric(reader, length, output);
    } else if (opcode === ALPHANUMERIC) {
      decodeAlphanumeric(reader, length, output);
    } else if (opcode === LOWER || opcode === UPPER) {
      const table =
        opcode === LOWER ? RM_HLE1_LOWER_TABLE : RM_HLE1_UPPER_TABLE;
      for (let count = 0; count < length; count += 1) {
        appendAscii(output, table[reader.read(5)]!);
      }
    } else if (opcode === BYTE) {
      for (let count = 0; count < length; count += 1)
        output.push(reader.read(8));
    } else {
      throw invalid("Unknown segment opcode.");
    }
    enforceOutputLimit(output.length);
  }
  throw invalid("End marker is missing.");
}

function considerUrlTokens(
  characters: readonly string[],
  index: number,
  best: number[],
  choices: (Choice | undefined)[],
): void {
  for (
    let tokenIndex = 0;
    tokenIndex < RM_HLE1_URL_TOKENS.length;
    tokenIndex += 1
  ) {
    const tokenCharacters = Array.from(RM_HLE1_URL_TOKENS[tokenIndex]!);
    if (
      tokenCharacters.every(
        (character, offset) => characters[index + offset] === character,
      )
    ) {
      choose(
        index,
        7 + best[index + tokenCharacters.length]!,
        { opcode: URL_TOKEN, length: tokenCharacters.length, tokenIndex },
        best,
        choices,
      );
    }
  }
}

function considerTableMode(
  characters: readonly string[],
  index: number,
  best: number[],
  choices: (Choice | undefined)[],
  opcode: number,
  table: string,
  payloadBits: (length: number) => number,
): void {
  for (
    let length = 1;
    length <= MAXIMUM_SEGMENT_LENGTH && index + length <= characters.length;
    length += 1
  ) {
    if (!table.includes(characters[index + length - 1]!)) break;
    choose(
      index,
      11 + payloadBits(length) + best[index + length]!,
      { opcode, length },
      best,
      choices,
    );
  }
}

function choose(
  index: number,
  cost: number,
  choice: Choice,
  best: number[],
  choices: (Choice | undefined)[],
): void {
  if (cost < best[index]!) {
    best[index] = cost;
    choices[index] = choice;
  }
}

function writeSegment(
  writer: BitWriter,
  characters: readonly string[],
  utf8: readonly Uint8Array[],
  index: number,
  choice: Choice,
): void {
  const selected = characters.slice(index, index + choice.length);
  if (choice.opcode === BYTE) {
    const bytes = selected.flatMap((_, offset) =>
      Array.from(utf8[index + offset]!),
    );
    writer.write(bytes.length - 1, 8);
    for (const byte of bytes) writer.write(byte, 8);
    return;
  }
  writer.write(choice.length - 1, 8);
  if (choice.opcode === NUMERIC) {
    for (let offset = 0; offset < selected.length; offset += 3) {
      const group = selected.slice(offset, offset + 3).join("");
      writer.write(
        Number(group),
        group.length === 3 ? 10 : group.length === 2 ? 7 : 4,
      );
    }
  } else if (choice.opcode === ALPHANUMERIC) {
    for (let offset = 0; offset < selected.length; offset += 2) {
      const first = RM_HLE1_ALPHANUMERIC_TABLE.indexOf(selected[offset]!);
      if (offset + 1 < selected.length) {
        const second = RM_HLE1_ALPHANUMERIC_TABLE.indexOf(
          selected[offset + 1]!,
        );
        writer.write(first * 45 + second, 11);
      } else {
        writer.write(first, 6);
      }
    }
  } else {
    const table =
      choice.opcode === LOWER ? RM_HLE1_LOWER_TABLE : RM_HLE1_UPPER_TABLE;
    for (const character of selected) writer.write(table.indexOf(character), 5);
  }
}

function decodeNumeric(
  reader: BitReader,
  length: number,
  output: number[],
): void {
  let remaining = length;
  while (remaining >= 3) {
    const value = reader.read(10);
    if (value > 999) throw invalid("Numeric triplet is out of range.");
    appendAscii(output, value.toString().padStart(3, "0"));
    remaining -= 3;
  }
  if (remaining === 2) {
    const value = reader.read(7);
    if (value > 99) throw invalid("Numeric pair is out of range.");
    appendAscii(output, value.toString().padStart(2, "0"));
  } else if (remaining === 1) {
    const value = reader.read(4);
    if (value > 9) throw invalid("Numeric digit is out of range.");
    appendAscii(output, String(value));
  }
}

function decodeAlphanumeric(
  reader: BitReader,
  length: number,
  output: number[],
): void {
  let remaining = length;
  while (remaining >= 2) {
    const value = reader.read(11);
    if (value >= 45 * 45) throw invalid("Alphanumeric pair is out of range.");
    appendAscii(output, RM_HLE1_ALPHANUMERIC_TABLE[Math.floor(value / 45)]!);
    appendAscii(output, RM_HLE1_ALPHANUMERIC_TABLE[value % 45]!);
    remaining -= 2;
  }
  if (remaining === 1) {
    const value = reader.read(6);
    if (value >= 45) throw invalid("Alphanumeric character is out of range.");
    appendAscii(output, RM_HLE1_ALPHANUMERIC_TABLE[value]!);
  }
}

function numericPayloadBits(length: number): number {
  return (
    Math.floor(length / 3) * 10 +
    (length % 3 === 2 ? 7 : length % 3 === 1 ? 4 : 0)
  );
}

function alphanumericPayloadBits(length: number): number {
  return Math.floor(length / 2) * 11 + (length % 2) * 6;
}

function appendAscii(output: number[], value: string): void {
  for (const character of value) output.push(character.charCodeAt(0));
}

function enforceOutputLimit(length: number): void {
  if (length > MAXIMUM_DECODED_BYTES)
    throw invalid("Decoded Payload is too large.");
}

function invalid(message: string): RectaMatrixError {
  return new RectaMatrixError(
    "DECOMPRESSION_FAILURE",
    `Invalid RM-HLE1 stream: ${message}`,
  );
}

class BitWriter {
  private readonly bits: boolean[] = [];
  public get bitLength(): number {
    return this.bits.length;
  }
  public write(value: number, width: number): void {
    for (let shift = width - 1; shift >= 0; shift -= 1) {
      this.bits.push(((value >>> shift) & 1) === 1);
    }
  }
  public toBytes(): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(this.bits.length / 8));
    for (let index = 0; index < this.bits.length; index += 1) {
      if (this.bits[index])
        bytes[Math.floor(index / 8)]! |= 1 << (7 - (index % 8));
    }
    return bytes;
  }
}

class BitReader {
  private offset = 0;
  public constructor(private readonly bytes: Uint8Array) {}
  public get remaining(): number {
    return this.bytes.length * 8 - this.offset;
  }
  public read(width: number): number {
    if (width > this.remaining) throw invalid("Segment is truncated.");
    let value = 0;
    for (let count = 0; count < width; count += 1) {
      value =
        (value << 1) |
        ((this.bytes[Math.floor(this.offset / 8)]! >>>
          (7 - (this.offset % 8))) &
          1);
      this.offset += 1;
    }
    return value;
  }
}
