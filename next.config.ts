import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["tesseract.js"],
  // In-process OCR dynamically loads worker/core assets and bundled language
  // data. Cold starts must not depend on a writable project or CDN access.
  outputFileTracingIncludes: {
    "/api/organizer/bills/*/*": [
      "./node_modules/tesseract.js/package.json",
      "./node_modules/tesseract.js/src/**/*.js",
      "./node_modules/tesseract.js-core/package.json",
      "./node_modules/tesseract.js-core/*.js",
      "./node_modules/tesseract.js-core/*.wasm",
      "./node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
      "./node_modules/@tesseract.js-data/eng/package.json",
      // The worker entrypoint is evaluated at runtime, outside webpack/NFT's
      // import graph. Retain its Node runtime dependencies as well.
      "./node_modules/{bmp-js,is-url,regenerator-runtime,wasm-feature-detect}/**/*.{js,cjs}",
      "./node_modules/{bmp-js,is-url,regenerator-runtime,wasm-feature-detect}/package.json",
    ],
  },
};

export default nextConfig;
