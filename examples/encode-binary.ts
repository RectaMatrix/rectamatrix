import { encodeBytes } from "@rectamatrix/encoder";

const symbol = encodeBytes(Uint8Array.of(0x00, 0xff, 0x10, 0x80), {
  eccLevel: "high",
  compression: "none",
});

console.log({
  sizeId: symbol.sizeId,
  width: symbol.width,
  height: symbol.height,
  maskId: symbol.maskId,
});
