import {
  encodeUtf8Strict,
  rmhle1EncodeDetailed,
} from "../packages/core/src/index.js";
import { encodeText } from "../packages/encoder/src/index.js";

const samples = [
  "123456789",
  "001234567890123456789",
  "ABC123",
  "hello world",
  "RMX-2026-000123456789",
  "https://www.example.com/items/123456789",
  '{"id":123456,"sku":"ABC-2026"}',
  "Grüße aus Berlin 🧭",
] as const;

for (const text of samples) {
  const raw = encodeUtf8Strict(text);
  const hle = rmhle1EncodeDetailed(text);
  const rawSymbol = encodeText(text, {
    compression: "none",
    eccLevel: "medium",
  });
  const hleSymbol = encodeText(text, {
    compression: "rm-hle1",
    eccLevel: "medium",
  });
  const autoSymbol = encodeText(text, {
    compression: "auto",
    eccLevel: "medium",
  });
  console.log(
    JSON.stringify({
      text,
      rawPayloadBits: raw.length * 8,
      rmHle1MeaningfulBits: hle.bitLength,
      rmHle1StoredBits: hle.bytes.length * 8,
      storedSavingsPercent:
        raw.length === 0
          ? 0
          : Math.round((1 - hle.bytes.length / raw.length) * 1000) / 10,
      rawFrameBits: (raw.length + 4) * 8,
      rmHle1FrameBits: (hle.bytes.length + 4) * 8,
      rawSizeId: rawSymbol.sizeId,
      rmHle1SizeId: hleSymbol.sizeId,
      autoCodec: autoSymbol.compression,
    }),
  );
}
