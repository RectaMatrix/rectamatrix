import { describe, expect, it } from "vitest";
import {
  buildInterleavingMap,
  calculateParityLength,
  calculateRsLayout,
  deinterleaveCodewords,
  encodeFrameBlocks,
  interleaveCodewords,
  reassembleFrame,
} from "../src/block-layout.js";

describe("RS block layout", () => {
  it("matches the specification parity examples", () => {
    expect(calculateParityLength(20, "low")).toBe(4);
    expect(calculateParityLength(40, "medium")).toBe(8);
    expect(calculateParityLength(40, "high")).toBe(12);
  });

  it("uses the smallest valid block count and distributes extra bytes first", () => {
    const layout = calculateRsLayout(369, "low");
    expect(layout.blockCount).toBe(2);
    expect(layout.blocks).toEqual([
      {
        index: 0,
        dataOffset: 0,
        dataLength: 185,
        parityLength: 10,
        totalLength: 195,
      },
      {
        index: 1,
        dataOffset: 185,
        dataLength: 184,
        parityLength: 10,
        totalLength: 194,
      },
    ]);
    expect(layout.totalCodewordBytes).toBe(389);
  });

  it("calculates the largest high-ECC size-4 frame layout", () => {
    const layout = calculateRsLayout(542, "high");
    expect(layout.blockCount).toBe(3);
    expect(layout.blocks.map((block) => block.dataLength)).toEqual([
      181, 181, 180,
    ]);
    expect(layout.blocks.map((block) => block.parityLength)).toEqual([
      55, 55, 54,
    ]);
    expect(layout.totalCodewordBytes).toBe(706);
  });
});

describe("codeword interleaving", () => {
  it("maps all data bytes before all parity bytes", () => {
    const layout = calculateRsLayout(256, "low");
    const map = buildInterleavingMap(layout);
    expect(map.slice(0, 5)).toEqual([
      { blockIndex: 0, section: "data", offset: 0 },
      { blockIndex: 1, section: "data", offset: 0 },
      { blockIndex: 0, section: "data", offset: 1 },
      { blockIndex: 1, section: "data", offset: 1 },
      { blockIndex: 0, section: "data", offset: 2 },
    ]);
    const firstParity = map.findIndex(
      (position) => position.section === "parity",
    );
    expect(firstParity).toBe(layout.totalDataBytes);
  });

  it("round-trips encoded blocks and reassembles the exact frame", () => {
    const frame = Uint8Array.from(
      { length: 400 },
      (_, index) => (index * 29 + 7) & 0xff,
    );
    const layout = calculateRsLayout(frame.length, "medium");
    const blocks = encodeFrameBlocks(frame, "medium");
    const interleaved = interleaveCodewords(blocks, layout);
    const restored = deinterleaveCodewords(interleaved, layout);

    expect(restored.map((block) => block.codeword)).toEqual(
      blocks.map((block) => block.codeword),
    );
    expect(
      reassembleFrame(
        restored.map((block) => block.data),
        layout,
      ),
    ).toEqual(frame);
  });

  it("rejects truncated or oversized streams", () => {
    const layout = calculateRsLayout(32, "low");
    expect(() =>
      deinterleaveCodewords(
        new Uint8Array(layout.totalCodewordBytes - 1),
        layout,
      ),
    ).toThrow(/length/i);
    expect(() => calculateRsLayout(3, "low")).toThrow(/between 4/i);
  });
});
