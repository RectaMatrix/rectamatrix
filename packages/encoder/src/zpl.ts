import type { EncodedSymbol } from "./types.js";
import { resolveQuietZone, type QuietZoneRenderOptions } from "./quiet-zone.js";

const DEFAULT_MODULE_SIZE = 8;
const MAXIMUM_GRAPHIC_BYTES = 99_999;

export interface ZplRenderOptions extends QuietZoneRenderOptions {
  readonly moduleSize?: number;
  readonly originX?: number;
  readonly originY?: number;
}

export function renderZpl(
  symbol: EncodedSymbol,
  options: ZplRenderOptions = {},
): string {
  const moduleSize = options.moduleSize ?? DEFAULT_MODULE_SIZE;
  const quietZone = resolveQuietZone(options);
  const originX = options.originX ?? 0;
  const originY = options.originY ?? 0;
  validateOptions(symbol, moduleSize, quietZone, originX, originY);

  const width = (symbol.width + quietZone * 2) * moduleSize;
  const height = (symbol.height + quietZone * 2) * moduleSize;
  const bytesPerRow = Math.ceil(width / 8);
  const totalBytes = bytesPerRow * height;
  if (totalBytes > MAXIMUM_GRAPHIC_BYTES) {
    throw new RangeError(
      `ZPL ^GFA output exceeds the ${String(MAXIMUM_GRAPHIC_BYTES)}-byte limit.`,
    );
  }

  const hexadecimal = renderGraphicHex(
    symbol,
    width,
    height,
    bytesPerRow,
    moduleSize,
    quietZone,
  );
  return [
    "^XA",
    `^PW${String(originX + width)}`,
    `^LL${String(originY + height)}`,
    `^FO${String(originX)},${String(originY)}`,
    `^GFA,${String(totalBytes)},${String(totalBytes)},${String(bytesPerRow)},${hexadecimal}`,
    "^FS",
    "^XZ",
  ].join("\n");
}

function renderGraphicHex(
  symbol: EncodedSymbol,
  width: number,
  height: number,
  bytesPerRow: number,
  moduleSize: number,
  quietZone: number,
): string {
  const hexadecimal: string[] = [];
  for (let pixelY = 0; pixelY < height; pixelY += 1) {
    const moduleY = Math.floor(pixelY / moduleSize) - quietZone;
    for (let byteX = 0; byteX < bytesPerRow; byteX += 1) {
      let value = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const pixelX = byteX * 8 + bit;
        if (pixelX >= width) continue;
        const moduleX = Math.floor(pixelX / moduleSize) - quietZone;
        const black =
          moduleX >= 0 &&
          moduleY >= 0 &&
          moduleX < symbol.width &&
          moduleY < symbol.height &&
          symbol.matrix[moduleY]![moduleX]!;
        if (black) value |= 0x80 >> bit;
      }
      hexadecimal.push(value.toString(16).padStart(2, "0").toUpperCase());
    }
  }
  return hexadecimal.join("");
}

function validateOptions(
  symbol: EncodedSymbol,
  moduleSize: number,
  quietZone: number,
  originX: number,
  originY: number,
): void {
  if (
    symbol.matrix.length !== symbol.height ||
    symbol.matrix.some((row) => row.length !== symbol.width)
  ) {
    throw new RangeError("Encoded Symbol matrix dimensions are invalid.");
  }
  if (!Number.isInteger(moduleSize) || moduleSize < 1) {
    throw new RangeError("ZPL module size must be a positive integer.");
  }
  if (!Number.isInteger(originX) || originX < 0) {
    throw new RangeError(
      "ZPL horizontal origin must be a non-negative integer.",
    );
  }
  if (!Number.isInteger(originY) || originY < 0) {
    throw new RangeError("ZPL vertical origin must be a non-negative integer.");
  }
}
