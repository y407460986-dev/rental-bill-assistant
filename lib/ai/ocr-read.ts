import "server-only";
import { access } from "node:fs/promises";
import { dirname } from "node:path";
import { Worker } from "node:worker_threads";

// Tesseract uses worker_threads in Node, not a separate executable. The outer
// thread gives us a termination handle BEFORE createWorker finishes, so the
// deadline also cancels initialization and its nested Tesseract thread.
const OCR_RUNTIME = String.raw`
const { parentPort, workerData } = require("node:worker_threads");
let code = "OCR_WORKER_START_FAILED";
const fail = () => parentPort.postMessage({ error: code });
(async () => {
  try {
    const { createWorker } = require(workerData.tesseractPath);
    const worker = await createWorker("eng", 1, {
      workerPath: workerData.workerPath,
      langPath: workerData.langPath,
      gzip: true,
      // Read the bundled data directly; never fetch a CDN or write project/HOME.
      cacheMethod: "none",
      cachePath: "/tmp/tesseract",
      errorHandler: fail,
    });
    code = "OCR_READ_FAILED";
    const result = await worker.recognize(Buffer.from(workerData.bytes));
    parentPort.postMessage({ text: result.data.text ?? "" });
  } catch {
    fail();
  }
})();
`;

export function readBillText(image: Blob, timeoutMs = 30000): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  let worker: Worker | undefined;
  let settled = false;
  const finish = (error: string | null, text = "") => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    // Node terminates nested workers with their parent. Do not wait for a
    // Tesseract job (or its initialization promise) to cooperate with cleanup.
    void worker?.terminate().catch(() => {});
    if (error) reject(new Error(error));
    else resolve(text);
  };
  const timer = setTimeout(() => finish("OCR_TIMEOUT"), timeoutMs);

  void (async () => {
    let tesseractPath: string;
    let workerPath: string;
    let langPath: string;
    try {
      // Resolve deployed files, not webpack module ids. Explicit route tracing
      // retains these dynamic dependencies.
      const { createRequire } = process.getBuiltinModule("node:module");
      const require = createRequire(`${process.cwd()}/package.json`);
      tesseractPath = require.resolve("tesseract.js");
      workerPath =
        require.resolve("tesseract.js/src/worker-script/node/index.js");
      const dataPath =
        require.resolve("@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz");
      langPath = dirname(dataPath);
      await Promise.all([
        access(workerPath),
        access(dataPath),
        access(require.resolve("tesseract.js-core/tesseract-core-lstm.wasm")),
      ]);
    } catch {
      finish("OCR_ASSET_MISSING");
      return;
    }
    try {
      const bytes = await image.arrayBuffer();
      if (settled) return;
      worker = new Worker(OCR_RUNTIME, {
        eval: true,
        workerData: { tesseractPath, workerPath, langPath, bytes },
        transferList: [bytes],
      });
      worker.once("error", () => finish("OCR_WORKER_START_FAILED"));
      worker.once("exit", () => finish("OCR_WORKER_START_FAILED"));
      worker.on("message", (message: unknown) => {
        if (!message || typeof message !== "object") return;
        if ("text" in message && typeof message.text === "string") {
          finish(null, message.text);
        } else if ("error" in message) {
          finish(
            message.error === "OCR_READ_FAILED"
              ? "OCR_READ_FAILED"
              : "OCR_WORKER_START_FAILED",
          );
        }
      });
    } catch {
      finish("OCR_WORKER_START_FAILED");
    }
  })();
  return promise;
}
