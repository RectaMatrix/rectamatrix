import { writeFile } from "node:fs/promises";

import { encodeText, renderZpl } from "@rectamatrix/encoder";

const symbol = encodeText("Hello RectaMatrix!", {
  eccLevel: "medium",
  compression: "auto",
});

const zpl = renderZpl(symbol, {
  moduleSize: 8,
  quietZoneProfile: "standard",
});

await writeFile("rectamatrix-label.zpl", zpl, "utf8");
console.log("Created rectamatrix-label.zpl");
