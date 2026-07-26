import { encodeText, renderSvg } from "@rectamatrix/encoder";

const symbol = encodeText("Grüße aus København – Ελληνικά – 中文 – 😀", {
  eccLevel: "medium",
  compression: "auto",
});

const svg = renderSvg(symbol, { moduleSize: 8, quietZone: 4 });

console.log({
  sizeId: symbol.sizeId,
  width: symbol.width,
  height: symbol.height,
  compression: symbol.compression,
  maskId: symbol.maskId,
  svgLength: svg.length,
});
