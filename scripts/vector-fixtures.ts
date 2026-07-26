import {
  CALCULATED_CAPACITIES,
  type EccLevel,
  type SizeId,
} from "../packages/core/src/index.js";
import {
  bytesToHex,
  createEncoderVector,
  createEncoderVectorSuite,
  type EncoderVector,
  type EncoderVectorInput,
  type EncoderVectorOptions,
  type EncoderVectorSuite,
} from "../packages/conformance/src/index.js";

const vectors: EncoderVector[] = [];

add("empty-binary", binary(new Uint8Array()), mediumNone());
add("empty-utf8", text(""), mediumNone());
add("ascii", text("RectaMatrix"), mediumNone());
add(
  "german-umlauts",
  text("Falsches Üben von Xylophonmusik quält."),
  mediumNone(),
);
add("latin-accents", text("Crème brûlée à São Tomé"), mediumNone());
add("combining-marks", text("Cafe\u0301 A\u030Angstro\u0308m"), mediumNone());
add("greek", text("Καλημέρα κόσμε"), mediumNone());
add("cyrillic", text("Привет, мир"), mediumNone());
add("arabic", text("مرحبا بالعالم"), mediumNone());
add("hebrew", text("שלום עולם"), mediumNone());
add("cjk", text("矩形矩阵参考实现"), mediumNone());
add("emoji", text("RectaMatrix 🧭🟦✨"), mediumNone());
add("binary-extremes", binary(Uint8Array.of(0, 255, 0, 255)), mediumNone());
add(
  "binary-all-octets",
  binary(Uint8Array.from({ length: 256 }, (_, index) => index)),
  Object.freeze({ eccLevel: "low", compression: "none" }),
);
add(
  "auto-compressible",
  text("ABCD".repeat(80)),
  Object.freeze({ eccLevel: "medium", compression: "auto" }),
);
add(
  "auto-incompressible",
  binary(
    Uint8Array.from({ length: 64 }, (_, index) => (index * 73 + 41) & 0xff),
  ),
  Object.freeze({ eccLevel: "medium", compression: "auto" }),
);
add(
  "explicit-rm-lz1",
  text("A".repeat(128)),
  Object.freeze({ eccLevel: "high", compression: "rm-lz1" }),
);

for (const capacity of CALCULATED_CAPACITIES) {
  for (const eccLevel of ["low", "medium", "high"] as const) {
    const length = capacity.maximumUncompressedPayloadBytes[eccLevel];
    add(
      `capacity-size-${String(capacity.sizeId)}-${eccLevel}`,
      binary(deterministicBytes(length, capacity.sizeId, eccLevel)),
      Object.freeze({
        eccLevel,
        compression: "none",
        sizeId: capacity.sizeId,
      }),
    );
  }
}

export function buildCanonicalEncoderVectorSuite(): EncoderVectorSuite {
  return createEncoderVectorSuite(vectors);
}

function add(
  id: string,
  input: EncoderVectorInput,
  options: EncoderVectorOptions,
): void {
  vectors.push(createEncoderVector(id, input, options));
}

function text(value: string): EncoderVectorInput {
  return Object.freeze({ type: "utf8", text: value });
}

function binary(value: Uint8Array): EncoderVectorInput {
  return Object.freeze({ type: "binary", hex: bytesToHex(value) });
}

function mediumNone(): EncoderVectorOptions {
  return Object.freeze({ eccLevel: "medium", compression: "none" });
}

function deterministicBytes(
  length: number,
  sizeId: SizeId,
  eccLevel: EccLevel,
): Uint8Array {
  const eccSeed = eccLevel === "low" ? 17 : eccLevel === "medium" ? 89 : 157;
  let state = (0x9e3779b9 ^ (sizeId << 24) ^ eccSeed) >>> 0;
  return Uint8Array.from({ length }, () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state & 0xff;
  });
}
