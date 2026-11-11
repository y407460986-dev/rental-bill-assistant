import { EventEmitter, once } from "node:events";
import type * as NodeFs from "node:fs/promises";
import type * as NodeThreads from "node:worker_threads";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import type { Worker as NodeWorker, WorkerOptions } from "node:worker_threads";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { Worker, access } = vi.hoisted(() => ({
  Worker: vi.fn(),
  access: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("node:worker_threads", () => ({ Worker }));
vi.mock("node:fs/promises", async (original) => ({
  ...(await original<typeof NodeFs>()),
  access,
}));
import { readBillText } from "../ocr-read";

class OcrThread extends EventEmitter {
  terminate = vi.fn().mockResolvedValue(0);
}

describe("bounded in-process OCR", () => {
  let thread: OcrThread;
  const recognize = vi.fn();
  const createWorker = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    access.mockReset().mockResolvedValue(undefined);
    Worker.mockReset();
    recognize
      .mockReset()
      .mockResolvedValue({ data: { text: "Printed 1,19 EUR" } });
    createWorker.mockReset().mockResolvedValue({ recognize });
    thread = new OcrThread();
    Worker.mockImplementation((source: string, options: WorkerOptions) => {
      runInNewContext(source, {
        Buffer,
        require: (name: string) =>
          name === "node:worker_threads"
            ? {
                workerData: options.workerData,
                parentPort: {
                  postMessage: (value: unknown) =>
                    Promise.resolve().then(() => thread.emit("message", value)),
                },
              }
            : { createWorker },
      });
      return thread;
    });
  });

  afterEach(() => vi.useRealTimers());

  async function start(timeout = 100) {
    const result = readBillText(new Blob(["image bytes"]), timeout);
    const outcome = result.then(
      (text) => ({ text }),
      (error: Error) => ({ error: error.message }),
    );
    await vi.advanceTimersByTimeAsync(0);
    return { result, outcome };
  }

  it("returns recognized text and terminates the whole OCR lifecycle", async () => {
    const { result } = await start();
    await expect(result).resolves.toBe("Printed 1,19 EUR");
    expect(thread.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["initialization", "recognition"])(
    "cancels stalled %s without waiting for its promise",
    async (phase) => {
      (phase === "initialization" ? createWorker : recognize).mockReturnValue(
        new Promise(() => {}),
      );
      const { outcome } = await start();
      await vi.advanceTimersByTimeAsync(100);
      expect(await outcome).toEqual({ error: "OCR_TIMEOUT" });
      expect(thread.terminate).toHaveBeenCalledOnce();
      if (phase === "initialization") expect(recognize).not.toHaveBeenCalled();
    },
  );

  it("uses one deadline across initialization and recognition", async () => {
    const initialization = Promise.withResolvers<{
      recognize: typeof recognize;
    }>();
    createWorker.mockReturnValue(initialization.promise);
    recognize.mockReturnValue(new Promise(() => {}));
    const { outcome } = await start();
    await vi.advanceTimersByTimeAsync(70);
    initialization.resolve({ recognize });
    await vi.advanceTimersByTimeAsync(30);
    expect(await outcome).toEqual({ error: "OCR_TIMEOUT" });
    expect(thread.terminate).toHaveBeenCalledOnce();
  });

  it.each(["initialization", "recognition"])(
    "sanitizes %s errors without leaking filesystem paths",
    async (phase) => {
      (phase === "initialization" ? createWorker : recognize).mockRejectedValue(
        new Error("secret /private/worker.js"),
      );
      const { outcome } = await start();
      expect(await outcome).toEqual({
        error:
          phase === "initialization"
            ? "OCR_WORKER_START_FAILED"
            : "OCR_READ_FAILED",
      });
      expect(thread.terminate).toHaveBeenCalledOnce();
    },
  );

  it("handles Tesseract's init error callback even when initialization stays pending", async () => {
    createWorker.mockImplementation((_lang, _mode, options) => {
      options.errorHandler("secret /private/model");
      return new Promise(() => {});
    });
    const { outcome } = await start();
    expect(await outcome).toEqual({ error: "OCR_WORKER_START_FAILED" });
    expect(thread.terminate).toHaveBeenCalledOnce();
  });

  it("reports missing bundled assets without starting OCR", async () => {
    access.mockRejectedValue(new Error("ENOENT /private/eng.traineddata.gz"));
    const { outcome } = await start();
    expect(await outcome).toEqual({ error: "OCR_ASSET_MISSING" });
    expect(Worker).not.toHaveBeenCalled();
  });

  it.each(["throw", "error", "exit"])(
    "reports thread startup %s safely",
    async (failure) => {
      createWorker.mockReturnValue(new Promise(() => {}));
      if (failure === "throw")
        Worker.mockImplementation(() => {
          throw new Error("private executable");
        });
      const { outcome } = await start();
      if (failure === "error")
        thread.emit("error", new Error("private module"));
      if (failure === "exit") thread.emit("exit", 1);
      expect(await outcome).toEqual({ error: "OCR_WORKER_START_FAILED" });
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("includes Blob conversion in the deadline and ignores late work", async () => {
    const bytes = Promise.withResolvers<ArrayBuffer>();
    const image = new Blob();
    vi.spyOn(image, "arrayBuffer").mockReturnValue(bytes.promise);
    const result = readBillText(image, 100);
    const rejected = expect(result).rejects.toThrow("OCR_TIMEOUT");
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    bytes.resolve(new ArrayBuffer(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(Worker).not.toHaveBeenCalled();
  });

  it.each(["initialization", "recognition"])(
    "terminates real nested worker computation during %s",
    async (phase) => {
      const actual = await vi.importActual<typeof NodeThreads>(
        "node:worker_threads",
      );
      const directory = await mkdtemp(join(tmpdir(), "ocr-cancel-"));
      const marker = join(directory, "phase");
      const fixture = join(directory, "tesseract.cjs");
      let actualThread: NodeWorker | undefined;
      let exited: Promise<unknown> | undefined;
      const ready = Promise.withResolvers<void>();
      try {
        await writeFile(
          fixture,
          `
const { Worker, parentPort } = require("node:worker_threads");
const { writeFileSync } = require("node:fs");
const hang = async () => {
  new Worker("while (true) {}", { eval: true });
  writeFileSync(${JSON.stringify(marker)}, ${JSON.stringify(phase)});
  parentPort.postMessage({ phase: true });
  await new Promise(() => {});
};
module.exports.createWorker = async () => {
  if (${JSON.stringify(phase)} === "initialization") await hang();
  return { recognize: hang };
};`,
        );
        Worker.mockImplementation((source: string, options: WorkerOptions) => {
          actualThread = new actual.Worker(source, {
            ...options,
            workerData: { ...options.workerData, tesseractPath: fixture },
          });
          actualThread.on("message", (message) => {
            if (message.phase) ready.resolve();
          });
          actualThread.on("error", ready.reject);
          exited = once(actualThread, "exit");
          return actualThread;
        });
        const result = readBillText(new Blob(["image bytes"]), 100);
        const rejected = expect(result).rejects.toThrow("OCR_TIMEOUT");
        await ready.promise;
        await vi.advanceTimersByTimeAsync(100);
        await rejected;
        expect(await exited).toEqual([1]);
        expect(await readFile(marker, "utf8")).toBe(phase);
      } finally {
        await actualThread?.terminate();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it("reads actual bundled traineddata with network denied and an empty cache", async () => {
    vi.useRealTimers();
    const actual = await vi.importActual<typeof NodeThreads>(
      "node:worker_threads",
    );
    const directory = await mkdtemp(join(tmpdir(), "ocr-offline-"));
    const blocker = join(directory, "offline.cjs");
    try {
      await writeFile(
        blocker,
        `global.fetch = () => { throw new Error("NETWORK_FORBIDDEN"); };`,
      );
      Worker.mockImplementation(
        (source: string, options: WorkerOptions) =>
          new actual.Worker(source, {
            ...options,
            // Nested Tesseract workers inherit execArgv too.
            execArgv: ["--require", blocker],
          }),
      );
      const image = await readFile(
        join(process.cwd(), "public/demo/synthetic-electricity.png"),
      );
      const text = await readBillText(new Blob([image]), 15000);
      expect(text).toMatch(/180[.,]00/);
      expect(text).toMatch(/SYNTHETIC/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 20000);
});
