import { decodeSampledSymbol } from "@rectamatrix/decoder";
import { encodeText } from "@rectamatrix/encoder";

const encoded = encodeText("RectaMatrix sampled-matrix example");
const decoded = decodeSampledSymbol({ modules: encoded.matrix });

if (!decoded.ok) {
  console.log(decoded.error);
} else {
  console.log({
    type: decoded.type,
    bytes: decoded.bytes.length,
    quality: decoded.metadata.quality,
  });
}
