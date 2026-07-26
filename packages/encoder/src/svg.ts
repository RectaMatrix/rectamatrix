import type { EncodedSymbol } from "./types.js";
import { resolveQuietZone, type QuietZoneRenderOptions } from "./quiet-zone.js";

export interface SvgRenderOptions extends QuietZoneRenderOptions {
  readonly moduleSize?: number;
}

export function renderSvg(
  symbol: EncodedSymbol,
  options?: SvgRenderOptions,
): string {
  const moduleSize = options?.moduleSize ?? 8;
  const quietZone = resolveQuietZone(options);
  if (!Number.isInteger(moduleSize) || moduleSize < 1) {
    throw new RangeError("SVG module size must be a positive integer.");
  }
  if (
    symbol.matrix.length !== symbol.height ||
    symbol.matrix.some((row) => row.length !== symbol.width)
  ) {
    throw new RangeError("Encoded Symbol matrix dimensions are invalid.");
  }

  const canvasWidth = (symbol.width + 2 * quietZone) * moduleSize;
  const canvasHeight = (symbol.height + 2 * quietZone) * moduleSize;
  const path: string[] = [];
  for (let y = 0; y < symbol.height; y += 1) {
    for (let x = 0; x < symbol.width; x += 1) {
      if (symbol.matrix[y]![x]) {
        const pixelX = (x + quietZone) * moduleSize;
        const pixelY = (y + quietZone) * moduleSize;
        path.push(
          `M${String(pixelX)} ${String(pixelY)}h${String(moduleSize)}v${String(moduleSize)}h-${String(moduleSize)}z`,
        );
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    ` viewBox="0 0 ${String(canvasWidth)} ${String(canvasHeight)}"`,
    ` width="${String(canvasWidth)}" height="${String(canvasHeight)}"`,
    ` shape-rendering="crispEdges">`,
    `<rect width="100%" height="100%" fill="#fff"/>`,
    `<path d="${path.join("")}" fill="#000"/>`,
    `</svg>`,
  ].join("");
}
