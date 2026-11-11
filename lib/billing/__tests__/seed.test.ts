import { it, expect, vi } from "vitest";
import { ensure } from "../../../scripts/demo-records.mjs";
it("demo initialization creates missing records and never updates existing ones", async () => {
  let record: Record<string, unknown> | null = null;
  const model = {
    findUnique: vi.fn(async () => record),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      record = { id: "stable", ...data };
      return record;
    }),
  };
  const expected = {
    name: "Synthetic tenant",
    start: new Date("2026-09-01"),
    terms: { synthetic: true },
  };
  const a = await ensure(model, "tenant", expected);
  const b = await ensure(model, "tenant", expected);
  expect(a).toEqual(b);
  expect(model.create).toHaveBeenCalledTimes(1);
  await expect(
    ensure(model, "tenant", { ...expected, name: "changed" }),
  ).rejects.toThrow("conflicts");
  expect(model.create).toHaveBeenCalledTimes(1);
  expect(b.name).toBe("Synthetic tenant");
});
