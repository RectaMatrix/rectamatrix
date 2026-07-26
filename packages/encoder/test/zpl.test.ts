import { describe, expect, it } from "vitest";
import { encodeText } from "../src/encoder.js";
import { renderZpl } from "../src/zpl.js";

describe("ZPL rendering", () => {
  it("renders deterministic uncompressed ASCII hexadecimal ^GFA data", () => {
    const symbol = encodeText("Zebra", {
      sizeId: 0,
      eccLevel: "high",
      compression: "none",
    });
    const first = renderZpl(symbol, {
      moduleSize: 2,
      quietZone: 4,
      originX: 10,
      originY: 12,
    });
    const second = renderZpl(symbol, {
      moduleSize: 2,
      quietZone: 4,
      originX: 10,
      originY: 12,
    });
    const graphic = parseGraphic(first);
    const width = (symbol.width + 8) * 2;
    const height = (symbol.height + 8) * 2;

    expect(first).toBe(second);
    expect(first).toContain(`^PW${String(width + 10)}`);
    expect(first).toContain(`^LL${String(height + 12)}`);
    expect(first).toContain("^FO10,12");
    expect(graphic.totalBytes).toBe(graphic.bytesPerRow * height);
    expect(graphic.hexadecimal).toMatch(/^[0-9A-F]+$/);
    expect(graphic.hexadecimal.length).toBe(graphic.totalBytes * 2);
  });

  it("preserves the Quiet Zone and expands every module into printer dots", () => {
    const symbol = encodeText("Dots", {
      sizeId: 0,
      eccLevel: "medium",
      compression: "none",
    });
    const moduleSize = 3;
    const quietZone = 4;
    const graphic = parseGraphic(renderZpl(symbol, { moduleSize, quietZone }));
    const height = (symbol.height + quietZone * 2) * moduleSize;
    const raster = decodeGraphic(
      graphic.hexadecimal,
      graphic.bytesPerRow,
      height,
    );

    for (let pixelY = 0; pixelY < height; pixelY += 1) {
      for (
        let pixelX = 0;
        pixelX < (symbol.width + quietZone * 2) * moduleSize;
        pixelX += 1
      ) {
        const moduleX = Math.floor(pixelX / moduleSize) - quietZone;
        const moduleY = Math.floor(pixelY / moduleSize) - quietZone;
        const expected =
          moduleX >= 0 &&
          moduleY >= 0 &&
          moduleX < symbol.width &&
          moduleY < symbol.height &&
          symbol.matrix[moduleY]![moduleX]!;
        expect(raster[pixelY]![pixelX]).toBe(expected);
      }
    }
  });

  it("renders the explicit two-module Compact profile", () => {
    const symbol = encodeText("Compact", { compression: "none" });
    const moduleSize = 2;
    const graphic = parseGraphic(
      renderZpl(symbol, { moduleSize, quietZoneProfile: "compact" }),
    );
    expect(graphic.bytesPerRow).toBe(
      Math.ceil(((symbol.width + 4) * moduleSize) / 8),
    );
  });

  it("validates printer geometry and the documented ^GFA byte limit", () => {
    const symbol = encodeText("Limits");
    expect(() => renderZpl(symbol, { moduleSize: 0 })).toThrow(/positive/i);
    expect(() => renderZpl(symbol, { quietZone: 3 })).toThrow(/Compact/i);
    expect(() => renderZpl(symbol, { originX: -1 })).toThrow(/non-negative/i);
    expect(() => renderZpl(symbol, { moduleSize: 100 })).toThrow(
      /99(?:,|)999-byte/i,
    );
  });
});

function parseGraphic(zpl: string): {
  readonly totalBytes: number;
  readonly bytesPerRow: number;
  readonly hexadecimal: string;
} {
  const line = zpl.split("\n").find((entry) => entry.startsWith("^GFA,"));
  if (line === undefined) throw new Error("Missing ^GFA command.");
  const parts = line.split(",");
  const totalBytes = Number(parts[1]);
  const graphicBytes = Number(parts[2]);
  const bytesPerRow = Number(parts[3]);
  const hexadecimal = parts[4];
  if (
    !Number.isInteger(totalBytes) ||
    totalBytes !== graphicBytes ||
    !Number.isInteger(bytesPerRow) ||
    hexadecimal === undefined
  ) {
    throw new Error("Malformed ^GFA command.");
  }
  return { totalBytes, bytesPerRow, hexadecimal };
}

function decodeGraphic(
  hexadecimal: string,
  bytesPerRow: number,
  height: number,
): readonly (readonly boolean[])[] {
  const rows: boolean[][] = [];
  for (let y = 0; y < height; y += 1) {
    const row: boolean[] = [];
    for (let byteX = 0; byteX < bytesPerRow; byteX += 1) {
      const offset = (y * bytesPerRow + byteX) * 2;
      const value = Number.parseInt(hexadecimal.slice(offset, offset + 2), 16);
      for (let bit = 0; bit < 8; bit += 1) {
        row.push((value & (0x80 >> bit)) !== 0);
      }
    }
    rows.push(row);
  }
  return rows;
}
