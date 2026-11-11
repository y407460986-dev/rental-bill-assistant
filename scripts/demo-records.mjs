import assert from "node:assert/strict";
export async function ensure(model, key, expected) {
  const demoKey = "rental-demo-v1:" + key;
  const old = await model.findUnique({ where: { demoKey } });
  if (old) {
    for (const [field, value] of Object.entries(expected)) {
      const actual = old[field];
      assert.deepEqual(
        actual instanceof Date ? actual.toISOString() : actual,
        value instanceof Date ? value.toISOString() : value,
        "Existing demo record conflicts: " + key + "." + field,
      );
    }
    return old;
  }
  return model.create({ data: { demoKey, ...expected } });
}
