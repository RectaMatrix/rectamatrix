import { mkdir, writeFile } from "node:fs/promises";
import { canonicalJson } from "../packages/conformance/src/index.js";
import { buildCanonicalDecoderNegativeVectorSuite } from "./decoder-negative-fixtures.js";
import { buildCanonicalDecoderPositiveVectorSuite } from "./decoder-positive-fixtures.js";
import { buildCanonicalImageVectorSuite } from "./image-vector-fixtures.js";
import { buildCanonicalEncoderVectorSuite } from "./vector-fixtures.js";

const rootDirectory = `${String(import.meta.dirname)}/..`;
const vectorDirectory = `${rootDirectory}/conformance/vectors`;
const vectorPath = `${vectorDirectory}/encoder-v1.json`;
const negativeVectorPath = `${vectorDirectory}/decoder-negative-v1.json`;
const positiveDecoderVectorPath = `${vectorDirectory}/decoder-positive-v1.json`;
const imageVectorPath = `${vectorDirectory}/image-v1.json`;
const encoderSuite = buildCanonicalEncoderVectorSuite();
const negativeDecoderSuite = buildCanonicalDecoderNegativeVectorSuite();
const positiveDecoderSuite = buildCanonicalDecoderPositiveVectorSuite();
const imageSuite = buildCanonicalImageVectorSuite();

await mkdir(vectorDirectory, { recursive: true });
await mkdir(`${vectorDirectory}/images`, { recursive: true });
await writeFile(vectorPath, canonicalJson(encoderSuite), "utf8");
await writeFile(
  negativeVectorPath,
  canonicalJson(negativeDecoderSuite),
  "utf8",
);
await writeFile(
  positiveDecoderVectorPath,
  canonicalJson(positiveDecoderSuite),
  "utf8",
);
await writeFile(imageVectorPath, canonicalJson(imageSuite.suite), "utf8");
for (const [file, bytes] of imageSuite.files) {
  await writeFile(`${vectorDirectory}/${file}`, bytes);
}
console.log(
  `Generated ${String(encoderSuite.vectors.length)} encoder, ${String(positiveDecoderSuite.vectors.length)} positive decoder, ${String(negativeDecoderSuite.vectors.length)} negative decoder, and ${String(imageSuite.suite.vectors.length)} image vectors.`,
);
