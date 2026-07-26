import { defineConfig } from "vitest/config";

const rootDirectory = String(import.meta.dirname);

export default defineConfig({
  resolve: {
    alias: {
      "@rectamatrix/browser": `${rootDirectory}/packages/browser/src/index.ts`,
      "@rectamatrix/core": `${rootDirectory}/packages/core/src/index.ts`,
      "@rectamatrix/conformance": `${rootDirectory}/packages/conformance/src/index.ts`,
      "@rectamatrix/decoder": `${rootDirectory}/packages/decoder/src/index.ts`,
      "@rectamatrix/detector": `${rootDirectory}/packages/detector/src/index.ts`,
      "@rectamatrix/encoder": `${rootDirectory}/packages/encoder/src/index.ts`,
    },
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
    include: ["packages/*/test/**/*.test.ts"],
  },
});
