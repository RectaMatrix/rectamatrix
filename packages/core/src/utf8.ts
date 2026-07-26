import { RectaMatrixError } from "./errors.js";

interface TextEncoderInstance {
  encode(input?: string): Uint8Array;
}

interface TextDecoderInstance {
  decode(input?: Uint8Array): string;
}

type TextEncoderConstructor = new () => TextEncoderInstance;
type TextDecoderConstructor = new (
  label?: string,
  options?: { readonly fatal?: boolean },
) => TextDecoderInstance;

const TextEncoderApi = (
  globalThis as unknown as { readonly TextEncoder: TextEncoderConstructor }
).TextEncoder;
const TextDecoderApi = (
  globalThis as unknown as { readonly TextDecoder: TextDecoderConstructor }
).TextDecoder;

export function hasUnpairedSurrogate(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

export function encodeUtf8Strict(text: string): Uint8Array {
  if (hasUnpairedSurrogate(text)) {
    throw new RectaMatrixError(
      "INVALID_UTF16",
      "Text contains an unpaired UTF-16 surrogate.",
    );
  }
  return new TextEncoderApi().encode(text);
}

export function decodeUtf8Strict(bytes: Uint8Array): string {
  try {
    return new TextDecoderApi("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new RectaMatrixError(
      "INVALID_UTF8",
      "Payload is not valid strict UTF-8.",
    );
  }
}
