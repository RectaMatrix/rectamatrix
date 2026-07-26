import { readFile } from "node:fs/promises";
import { crc32c } from "../packages/core/src/index.js";
import {
  canonicalJson,
  uint32ToHex,
  validateAndVerifyImageVectorSuite,
  verifyDecoderNegativeVectorSuite,
  verifyDecoderPositiveVectorSuite,
  verifyEncoderVectorSuite,
} from "../packages/conformance/src/index.js";
import {
  parsePortableGraymap,
  type ImageDataLike,
} from "../packages/detector/src/index.js";
import { buildCanonicalDecoderNegativeVectorSuite } from "./decoder-negative-fixtures.js";
import { buildCanonicalDecoderPositiveVectorSuite } from "./decoder-positive-fixtures.js";
import { buildCanonicalImageVectorSuite } from "./image-vector-fixtures.js";
import { buildCanonicalEncoderVectorSuite } from "./vector-fixtures.js";

const rootDirectory = `${String(import.meta.dirname)}/..`;
const vectorPath = `${rootDirectory}/conformance/vectors/encoder-v1.json`;
const negativeVectorPath = `${rootDirectory}/conformance/vectors/decoder-negative-v1.json`;
const positiveDecoderVectorPath = `${rootDirectory}/conformance/vectors/decoder-positive-v1.json`;
const imageVectorPath = `${rootDirectory}/conformance/vectors/image-v1.json`;
const encoderSource = await readFile(vectorPath, "utf8");
const negativeDecoderSource = await readFile(negativeVectorPath, "utf8");
const positiveDecoderSource = await readFile(positiveDecoderVectorPath, "utf8");
const imageSource = await readFile(imageVectorPath, "utf8");
const storedEncoder: unknown = JSON.parse(encoderSource);
const storedNegativeDecoder: unknown = JSON.parse(negativeDecoderSource);
const storedPositiveDecoder: unknown = JSON.parse(positiveDecoderSource);
const storedImage: unknown = JSON.parse(imageSource);
const verifiedEncoder = verifyEncoderVectorSuite(storedEncoder);
const verifiedNegativeDecoder = verifyDecoderNegativeVectorSuite(
  storedNegativeDecoder,
);
const verifiedPositiveDecoder = verifyDecoderPositiveVectorSuite(
  storedPositiveDecoder,
);
const rebuiltEncoder = canonicalJson(buildCanonicalEncoderVectorSuite());
const rebuiltNegativeDecoder = canonicalJson(
  buildCanonicalDecoderNegativeVectorSuite(),
);
const rebuiltPositiveDecoder = canonicalJson(
  buildCanonicalDecoderPositiveVectorSuite(),
);
const rebuiltImageFixtures = buildCanonicalImageVectorSuite();
const rebuiltImage = canonicalJson(rebuiltImageFixtures.suite);
const parsedImages = new Map<string, ImageDataLike>();
for (const vector of rebuiltImageFixtures.suite.vectors) {
  const storedBytes = await readFile(
    `${rootDirectory}/conformance/vectors/${vector.image.file}`,
  );
  const rebuiltBytes = rebuiltImageFixtures.files.get(vector.image.file);
  if (
    rebuiltBytes === undefined ||
    storedBytes.length !== rebuiltBytes.length ||
    storedBytes.some((value, index) => value !== rebuiltBytes[index]) ||
    uint32ToHex(crc32c(storedBytes)) !== vector.image.crc32cHex
  ) {
    throw new Error(`Canonical image ${vector.image.file} is stale.`);
  }
  parsedImages.set(vector.image.file, parsePortableGraymap(storedBytes));
}
const verifiedImages = validateAndVerifyImageVectorSuite(
  storedImage,
  parsedImages,
);

if (
  encoderSource !== rebuiltEncoder ||
  negativeDecoderSource !== rebuiltNegativeDecoder ||
  positiveDecoderSource !== rebuiltPositiveDecoder ||
  imageSource !== rebuiltImage
) {
  throw new Error(
    "Canonical vectors are stale or not canonically formatted. Run pnpm generate:vectors.",
  );
}

console.log(
  `Verified ${String(verifiedEncoder.length)} encoder, ${String(verifiedPositiveDecoder.length)} positive decoder, ${String(verifiedNegativeDecoder.length)} negative decoder, and ${String(verifiedImages.length)} image vectors.`,
);
