import { readFile } from "node:fs/promises";
import { decodeImageData, parsePortableGraymap } from "@rectamatrix/detector";

const pgm = await readFile("conformance/vectors/images/clean.pgm");
const result = decodeImageData(parsePortableGraymap(pgm));

if (!result.ok) {
  console.log(result.error.code, result.error.message);
} else if (result.type === "utf8") {
  console.log(result.text, result.vision.orientationDegrees);
} else {
  console.log(result.bytes, result.vision.orientationDegrees);
}
