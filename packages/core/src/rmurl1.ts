import { RectaMatrixError } from "./errors.js";

const FIXED_LENGTH_VERSION = 0;
const COMPACT_LENGTH_VERSION = 1;
const MAXIMUM_DECODED_BYTES = 0xffff;
const HOST_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789-";
const TAIL_LOWER_PATH = "abcdefghijklmnopqrstuvwxyz/._-?#";
const TAIL_LOWER_QUERY = "abcdefghijklmnopqrstuvwxyz&=.-_#";
const TAIL_LOWER_FRAGMENT = "abcdefghijklmnopqrstuvwxyz/._-~?";
const TAIL_DELIMITERS = "&=#:;+@,";
const TAIL_MIXED =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
const MAXIMUM_TAIL_RUN = 64;
type TailState = "path" | "query" | "fragment";

export const RM_URL1_TLDS = Object.freeze([
  "com",
  "org",
  "net",
  "de",
  "co",
  "uk",
  "io",
  "edu",
  "gov",
  "fr",
  "it",
  "nl",
  "cn",
  "in",
  "us",
  "ca",
  "au",
  "nz",
  "jp",
  "kr",
  "br",
  "mx",
  "es",
  "be",
  "ch",
  "at",
  "se",
  "no",
  "dk",
  "fi",
  "pl",
  "eu",
] as const);

export const RM_URL1_TAIL_TOKENS = Object.freeze([
  "/api/",
  "/v1/",
  "/v2/",
  "/index.html",
  ".html",
  ".htm",
  ".json",
  ".xml",
  ".php",
  ".js",
  ".css",
  "/assets/",
  "/images/",
  "id=",
  "page=",
  "lang=",
] as const);

export interface RmUrl1Encoding {
  readonly bytes: Uint8Array;
  readonly bitLength: number;
  readonly version: 0 | 1;
}

interface ParsedUrl {
  readonly secure: boolean;
  readonly hasWww: boolean;
  readonly labels: readonly string[];
  readonly port: string | undefined;
  readonly tail: string;
}

/** Encodes an exact, lower-host ASCII HTTP(S) URL using experimental RM-URL1. */
export function rmurl1Encode(text: string): Uint8Array {
  return rmurl1EncodeDetailed(text).bytes;
}

export function rmurl1EncodeDetailed(text: string): RmUrl1Encoding {
  const parsed = parseSupportedUrl(text);
  const fixed = encodeParsedUrl(parsed, FIXED_LENGTH_VERSION);
  const compact = encodeParsedUrl(parsed, COMPACT_LENGTH_VERSION);
  return compact.bitLength < fixed.bitLength ? compact : fixed;
}

function encodeParsedUrl(parsed: ParsedUrl, version: 0 | 1): RmUrl1Encoding {
  const writer = new BitWriter();
  writer.write(version, 3);
  writer.write(parsed.secure ? 1 : 0, 1);
  writer.write(parsed.hasWww ? 1 : 0, 1);
  const domainLabelCount = parsed.labels.length - 1;
  if (domainLabelCount <= 6) writer.write(domainLabelCount, 3);
  else {
    writer.write(7, 3);
    writer.write(domainLabelCount, 7);
  }
  for (let index = 0; index < domainLabelCount; index += 1)
    writeHostLabel(writer, parsed.labels[index]!);
  const finalLabel = parsed.labels[domainLabelCount]!;
  writeFinalLabel(writer, finalLabel);
  writePort(writer, parsed.secure, parsed.port);
  writeTail(writer, parsed.tail, version === COMPACT_LENGTH_VERSION);
  return Object.freeze({
    bytes: writer.toBytes(),
    bitLength: writer.bitLength,
    version,
  });
}

/** Decodes RM-URL1 and returns the exact ASCII URL bytes. */
export function rmurl1Decode(input: Uint8Array): Uint8Array {
  if (!(input instanceof Uint8Array))
    throw new TypeError("RM-URL1 input must be a Uint8Array.");
  const reader = new BitReader(input);
  const version = reader.read(3);
  if (version !== FIXED_LENGTH_VERSION && version !== COMPACT_LENGTH_VERSION)
    throw invalid(`Unsupported version ${String(version)}.`);
  const secure = reader.read(1) === 1;
  const hasWww = reader.read(1) === 1;
  const compactDomainLabelCount = reader.read(3);
  const domainLabelCount =
    compactDomainLabelCount < 7 ? compactDomainLabelCount : reader.read(7);
  const labels: string[] = [];
  for (let index = 0; index < domainLabelCount; index += 1)
    labels.push(readHostLabel(reader));
  labels.push(readFinalLabel(reader));
  const port = readPort(reader, secure);
  const tail = readTail(reader, version === COMPACT_LENGTH_VERSION);
  assertZeroPadding(reader);
  const text = `${secure ? "https" : "http"}://${hasWww ? "www." : ""}${labels.join(".")}${port === undefined ? "" : `:${port}`}${tail}`;
  if (text.length > MAXIMUM_DECODED_BYTES)
    throw invalid("Decoded Payload is too large.");
  return Uint8Array.from(text, (character) => character.charCodeAt(0));
}

function parseSupportedUrl(text: string): ParsedUrl {
  if (typeof text !== "string")
    throw new TypeError("RM-URL1 input must be a string.");
  if (!isAscii(text)) throw unsupported("Only exact ASCII URLs are supported.");
  const match = /^(https?):\/\/([^/?#]*)([\s\S]*)$/.exec(text);
  if (match === null)
    throw unsupported(
      "Only lowercase http:// and https:// URLs are supported.",
    );
  const authority = match[2]!;
  if (
    authority.length === 0 ||
    authority.includes("@") ||
    authority.startsWith("[")
  ) {
    throw unsupported(
      "Empty hosts, userinfo, and IPv6 literals use the general fallback.",
    );
  }
  let hostname = authority;
  let port: string | undefined;
  const colon = authority.lastIndexOf(":");
  if (colon >= 0) {
    hostname = authority.slice(0, colon);
    port = authority.slice(colon + 1);
    if (!/^\d{1,5}$/.test(port))
      throw unsupported("Ports must contain one to five decimal digits.");
    if (Number(port) > 0xffff)
      throw unsupported("Port values must not exceed 65535.");
  }
  if (hostname !== hostname.toLowerCase())
    throw unsupported("Host casing must use the general lossless fallback.");
  const originalLabels = hostname.split(".");
  const hasWww = originalLabels[0] === "www" && originalLabels.length > 1;
  const labels = hasWww ? originalLabels.slice(1) : originalLabels;
  if (
    labels.length === 0 ||
    labels.length > 128 ||
    labels.some((label) => !isSupportedHostLabel(label))
  ) {
    throw unsupported(
      "Host labels must contain lowercase ASCII letters, digits, or hyphens.",
    );
  }
  return Object.freeze({
    secure: match[1] === "https",
    hasWww,
    labels,
    port,
    tail: match[3]!,
  });
}

function isSupportedHostLabel(label: string): boolean {
  return (
    label.length >= 1 &&
    label.length <= 63 &&
    Array.from(label).every((character) => HOST_ALPHABET.includes(character))
  );
}

function isAscii(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) > 0x7f) return false;
  }
  return true;
}

function writeHostLabel(writer: BitWriter, label: string): void {
  writer.write(label.length - 1, 6);
  for (let index = 0; index < label.length; index += 2) {
    const first = HOST_ALPHABET.indexOf(label[index]!);
    if (index + 1 < label.length) {
      const second = HOST_ALPHABET.indexOf(label[index + 1]!);
      writer.write(first * HOST_ALPHABET.length + second, 11);
    } else writer.write(first, 6);
  }
}

function readHostLabel(reader: BitReader): string {
  const length = reader.read(6) + 1;
  let label = "";
  for (let index = 0; index < length; index += 2) {
    if (index + 1 < length) {
      const pair = reader.read(11);
      if (pair >= HOST_ALPHABET.length ** 2)
        throw invalid("Host pair is out of range.");
      label += HOST_ALPHABET[Math.floor(pair / HOST_ALPHABET.length)]!;
      label += HOST_ALPHABET[pair % HOST_ALPHABET.length]!;
    } else {
      const value = reader.read(6);
      if (value >= HOST_ALPHABET.length)
        throw invalid("Host character is out of range.");
      label += HOST_ALPHABET[value]!;
    }
  }
  return label;
}

function writeFinalLabel(writer: BitWriter, label: string): void {
  const index = RM_URL1_TLDS.indexOf(label as (typeof RM_URL1_TLDS)[number]);
  if (index === 0) writer.write(0b00, 2);
  else if (index >= 1 && index <= 2) writer.write(0b010 + index - 1, 3);
  else if (index >= 3 && index <= 8) writer.write(0b1000 + index - 3, 4);
  else if (index >= 9) {
    writer.write(0b1110, 4);
    writer.write(index, 5);
  } else {
    writer.write(0b1111, 4);
    writeHostLabel(writer, label);
  }
}

function readFinalLabel(reader: BitReader): string {
  const first = reader.read(2);
  if (first === 0b00) return RM_URL1_TLDS[0];
  if (first === 0b01) return RM_URL1_TLDS[reader.read(1) + 1]!;
  if (first === 0b10) return RM_URL1_TLDS[reader.read(2) + 3]!;
  const extension = reader.read(2);
  if (extension <= 1) return RM_URL1_TLDS[extension + 7]!;
  if (extension === 2) {
    const index = reader.read(5);
    if (index < 9) throw invalid("Extended TLD index is not canonical.");
    return RM_URL1_TLDS[index]!;
  }
  return readHostLabel(reader);
}

function writePort(
  writer: BitWriter,
  secure: boolean,
  port: string | undefined,
): void {
  if (port === undefined) {
    writer.write(0, 1);
    return;
  }
  const defaultPort = secure ? "443" : "80";
  if (port === defaultPort) writer.write(0b10, 2);
  else if (port === "8080") writer.write(0b110, 3);
  else {
    writer.write(0b111, 3);
    writer.write(port.length - 1, 3);
    for (const digit of port) writer.write(Number(digit), 4);
  }
}

function readPort(reader: BitReader, secure: boolean): string | undefined {
  if (reader.read(1) === 0) return undefined;
  if (reader.read(1) === 0) return secure ? "443" : "80";
  if (reader.read(1) === 0) return "8080";
  const length = reader.read(3) + 1;
  if (length > 5) throw invalid("Port text exceeds five digits.");
  let port = "";
  for (let index = 0; index < length; index += 1) {
    const digit = reader.read(4);
    if (digit > 9) throw invalid("Port contains an invalid digit.");
    port += String(digit);
  }
  if (Number(port) > 0xffff) throw invalid("Port value exceeds 65535.");
  if (port === (secure ? "443" : "80") || port === "8080")
    throw invalid("Individual port encoding is not canonical.");
  return port;
}

type TailChoice =
  | {
      readonly kind: "lower" | "numeric" | "mixed" | "ascii";
      readonly length: number;
    }
  | { readonly kind: "percent"; readonly length: 3 }
  | { readonly kind: "delimiter"; readonly length: 1 }
  | {
      readonly kind: "token";
      readonly length: number;
      readonly token: number;
    };

function writeTail(
  writer: BitWriter,
  tail: string,
  compactLengths: boolean,
): void {
  const choices = chooseTailSegments(tail, compactLengths);
  const states = tailStates(tail);
  for (let index = 0; index < tail.length;) {
    const choice = choices[index]!;
    const value = tail.slice(index, index + choice.length);
    if (choice.kind === "lower") {
      writer.write(0b00, 2);
      writeTailRunLength(writer, choice.length, compactLengths);
      const table = lowerTable(states[index]!);
      for (const character of value) writer.write(table.indexOf(character), 5);
    } else if (choice.kind === "numeric") {
      writer.write(0b01, 2);
      writeTailRunLength(writer, choice.length, compactLengths);
      writeNumeric(writer, value);
    } else if (choice.kind === "mixed") {
      writer.write(0b10, 2);
      writeTailRunLength(writer, choice.length, compactLengths);
      for (const character of value)
        writer.write(TAIL_MIXED.indexOf(character), 6);
    } else if (choice.kind === "percent") {
      const digits = value.slice(1);
      writer.write(0b110, 3);
      writer.write(Number.parseInt(digits, 16), 8);
      writer.write(/[a-f]/.test(digits[0]!) ? 1 : 0, 1);
      writer.write(/[a-f]/.test(digits[1]!) ? 1 : 0, 1);
    } else if (choice.kind === "delimiter") {
      writer.write(0b1110, 4);
      writer.write(TAIL_DELIMITERS.indexOf(value), 3);
    } else if (choice.kind === "token") {
      writer.write(0b111110, 6);
      writer.write(choice.token, 4);
    } else {
      writer.write(0b11110, 5);
      writeTailRunLength(writer, choice.length, compactLengths);
      for (const character of value) writer.write(character.charCodeAt(0), 7);
    }
    index += choice.length;
  }
  writer.write(0b111111, 6);
}

function chooseTailSegments(
  tail: string,
  compactLengths: boolean,
): readonly TailChoice[] {
  const best = Array<number>(tail.length + 1).fill(Number.POSITIVE_INFINITY);
  const choices = Array<TailChoice | undefined>(tail.length);
  const states = tailStates(tail);
  best[tail.length] = 6;
  for (let index = tail.length - 1; index >= 0; index -= 1) {
    for (let token = 0; token < RM_URL1_TAIL_TOKENS.length; token += 1) {
      const value = RM_URL1_TAIL_TOKENS[token]!;
      if (tail.startsWith(value, index))
        chooseTail(
          index,
          10 + best[index + value.length]!,
          { kind: "token", length: value.length, token },
          best,
          choices,
        );
    }
    if (
      tail[index] === "%" &&
      index + 2 < tail.length &&
      /^[0-9A-Fa-f]{2}$/.test(tail.slice(index + 1, index + 3))
    ) {
      chooseTail(
        index,
        13 + best[index + 3]!,
        { kind: "percent", length: 3 },
        best,
        choices,
      );
    }
    const delimiter = TAIL_DELIMITERS.indexOf(tail[index]!);
    if (delimiter >= 0)
      chooseTail(
        index,
        7 + best[index + 1]!,
        { kind: "delimiter", length: 1 },
        best,
        choices,
      );
    considerLowerTailRun(tail, index, states, compactLengths, best, choices);
    considerTailRun(
      tail,
      index,
      "0123456789",
      (length) =>
        2 +
        tailRunLengthBits(length, compactLengths) +
        numericPayloadBits(length),
      "numeric",
      best,
      choices,
    );
    considerTailRun(
      tail,
      index,
      TAIL_MIXED,
      (length) => 2 + tailRunLengthBits(length, compactLengths) + length * 6,
      "mixed",
      best,
      choices,
    );
    for (
      let length = 1;
      length <= MAXIMUM_TAIL_RUN && index + length <= tail.length;
      length += 1
    ) {
      chooseTail(
        index,
        5 +
          tailRunLengthBits(length, compactLengths) +
          length * 7 +
          best[index + length]!,
        { kind: "ascii", length },
        best,
        choices,
      );
    }
  }
  return choices as readonly TailChoice[];
}

function considerLowerTailRun(
  tail: string,
  index: number,
  states: readonly TailState[],
  compactLengths: boolean,
  best: number[],
  choices: (TailChoice | undefined)[],
): void {
  const state = states[index]!;
  const alphabet = lowerTable(state);
  for (
    let length = 1;
    length <= MAXIMUM_TAIL_RUN && index + length <= tail.length;
    length += 1
  ) {
    if (states[index + length - 1] !== state) break;
    if (!alphabet.includes(tail[index + length - 1]!)) break;
    chooseTail(
      index,
      2 +
        tailRunLengthBits(length, compactLengths) +
        length * 5 +
        best[index + length]!,
      { kind: "lower", length },
      best,
      choices,
    );
  }
}

function considerTailRun(
  tail: string,
  index: number,
  alphabet: string,
  cost: (length: number) => number,
  kind: "lower" | "numeric" | "mixed",
  best: number[],
  choices: (TailChoice | undefined)[],
): void {
  for (
    let length = 1;
    length <= MAXIMUM_TAIL_RUN && index + length <= tail.length;
    length += 1
  ) {
    if (!alphabet.includes(tail[index + length - 1]!)) break;
    chooseTail(
      index,
      cost(length) + best[index + length]!,
      { kind, length },
      best,
      choices,
    );
  }
}

function chooseTail(
  index: number,
  cost: number,
  choice: TailChoice,
  best: number[],
  choices: (TailChoice | undefined)[],
): void {
  if (cost < best[index]!) {
    best[index] = cost;
    choices[index] = choice;
  }
}

function readTail(reader: BitReader, compactLengths: boolean): string {
  let tail = "";
  let state: TailState = "path";
  for (;;) {
    const first = reader.read(2);
    if (first === 0b00) {
      const length = readTailRunLength(reader, compactLengths);
      const table = lowerTable(state);
      for (let index = 0; index < length; index += 1) {
        const character = table[reader.read(5)]!;
        tail += character;
        state = nextTailState(state, character);
      }
    } else if (first === 0b01) {
      tail += readNumeric(reader, readTailRunLength(reader, compactLengths));
    } else if (first === 0b10) {
      const length = readTailRunLength(reader, compactLengths);
      for (let index = 0; index < length; index += 1)
        tail += TAIL_MIXED[reader.read(6)]!;
    } else {
      const extended = reader.read(1);
      if (extended === 0) {
        const byte = reader.read(8);
        const lowerFirst = reader.read(1) === 1;
        const lowerSecond = reader.read(1) === 1;
        const hex = byte.toString(16).padStart(2, "0");
        if (
          (/\d/.test(hex[0]!) && lowerFirst) ||
          (/\d/.test(hex[1]!) && lowerSecond)
        )
          throw invalid("Percent escape case bits are not canonical.");
        tail += `%${applyHexCase(hex[0]!, lowerFirst)}${applyHexCase(hex[1]!, lowerSecond)}`;
      } else {
        const subtype = reader.read(1);
        if (subtype === 0) {
          const character = TAIL_DELIMITERS[reader.read(3)]!;
          tail += character;
          state = nextTailState(state, character);
        } else {
          const terminal = reader.read(1);
          if (terminal === 0) {
            const length = readTailRunLength(reader, compactLengths);
            for (let index = 0; index < length; index += 1) {
              const character = String.fromCharCode(reader.read(7));
              tail += character;
              state = nextTailState(state, character);
            }
          } else if (reader.read(1) === 0) {
            const token = RM_URL1_TAIL_TOKENS[reader.read(4)]!;
            tail += token;
            for (const character of token)
              state = nextTailState(state, character);
          } else return tail;
        }
      }
    }
    if (tail.length > MAXIMUM_DECODED_BYTES)
      throw invalid("Decoded Payload is too large.");
  }
}

function tailStates(tail: string): readonly TailState[] {
  const states: TailState[] = [];
  let state: TailState = "path";
  for (const character of tail) {
    states.push(state);
    state = nextTailState(state, character);
  }
  return states;
}

function nextTailState(state: TailState, character: string): TailState {
  if (character === "#") return "fragment";
  if (state === "path" && character === "?") return "query";
  return state;
}

function lowerTable(state: TailState): string {
  if (state === "query") return TAIL_LOWER_QUERY;
  if (state === "fragment") return TAIL_LOWER_FRAGMENT;
  return TAIL_LOWER_PATH;
}

function tailRunLengthBits(length: number, compactLengths: boolean): number {
  if (!compactLengths) return 6;
  if (length <= 8) return 4;
  if (length <= 24) return 6;
  return 8;
}

function writeTailRunLength(
  writer: BitWriter,
  length: number,
  compactLengths: boolean,
): void {
  if (length < 1 || length > MAXIMUM_TAIL_RUN)
    throw new RangeError("RM-URL1 tail run length is out of range.");
  if (!compactLengths) {
    writer.write(length - 1, 6);
  } else if (length <= 8) {
    writer.write(length - 1, 4);
  } else if (length <= 24) {
    writer.write(0b10, 2);
    writer.write(length - 9, 4);
  } else {
    writer.write(0b11, 2);
    writer.write(length - 25, 6);
  }
}

function readTailRunLength(reader: BitReader, compactLengths: boolean): number {
  if (!compactLengths) return reader.read(6) + 1;
  if (reader.read(1) === 0) return reader.read(3) + 1;
  if (reader.read(1) === 0) return reader.read(4) + 9;
  const length = reader.read(6) + 25;
  if (length > MAXIMUM_TAIL_RUN)
    throw invalid("Tail run length exceeds the canonical maximum.");
  return length;
}

function writeNumeric(writer: BitWriter, digits: string): void {
  for (let index = 0; index < digits.length; index += 3) {
    const remaining = Math.min(3, digits.length - index);
    writer.write(
      Number(digits.slice(index, index + remaining)),
      remaining === 3 ? 10 : remaining === 2 ? 7 : 4,
    );
  }
}

function readNumeric(reader: BitReader, length: number): string {
  let output = "";
  for (let index = 0; index < length; index += 3) {
    const remaining = Math.min(3, length - index);
    const value = reader.read(remaining === 3 ? 10 : remaining === 2 ? 7 : 4);
    const limit = remaining === 3 ? 999 : remaining === 2 ? 99 : 9;
    if (value > limit) throw invalid("Numeric run value is out of range.");
    output += value.toString().padStart(remaining, "0");
  }
  return output;
}

function numericPayloadBits(length: number): number {
  return (
    Math.floor(length / 3) * 10 +
    (length % 3 === 2 ? 7 : length % 3 === 1 ? 4 : 0)
  );
}

function applyHexCase(character: string, lower: boolean): string {
  return lower ? character.toLowerCase() : character.toUpperCase();
}

function assertZeroPadding(reader: BitReader): void {
  while (reader.remaining > 0)
    if (reader.read(1) !== 0) throw invalid("Padding bits must be zero.");
}

function unsupported(message: string): RectaMatrixError {
  return new RectaMatrixError(
    "UNSUPPORTED_URL",
    `RM-URL1 cannot encode this value: ${message}`,
  );
}

function invalid(message: string): RectaMatrixError {
  return new RectaMatrixError(
    "DECOMPRESSION_FAILURE",
    `Invalid RM-URL1 stream: ${message}`,
  );
}

class BitWriter {
  private readonly bits: boolean[] = [];
  public get bitLength(): number {
    return this.bits.length;
  }
  public write(value: number, width: number): void {
    for (let shift = width - 1; shift >= 0; shift -= 1)
      this.bits.push(((value >>> shift) & 1) === 1);
  }
  public toBytes(): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(this.bits.length / 8));
    for (let index = 0; index < this.bits.length; index += 1)
      if (this.bits[index])
        bytes[Math.floor(index / 8)]! |= 1 << (7 - (index % 8));
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
    if (width > this.remaining) throw invalid("Stream is truncated.");
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
