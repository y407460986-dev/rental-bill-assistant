// Creates isolated, visibly synthetic fixtures and removes only those fixture rows.
// Run: node --env-file=.env scripts/check-rental-workflow.mjs [base-url]
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
const base = process.argv[2] || "http://127.0.0.1:3100";
const db = new PrismaClient();
const properties = [];
const accounts = [];
async function session(role) {
  let cookie = "";
  return {
    role,
    async request(path, body) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await fetch(base + path, {
            headers: {
              origin: base,
              cookie,
              ...(body === undefined
                ? {}
                : { "Content-Type": "application/json" }),
            },
            method: body === undefined ? "GET" : "POST",
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(40000),
          });
          const cs = r.headers.getSetCookie();
          if (cs.length) cookie = cs.map((x) => x.split(";")[0]).join("; ");
          console.log(role, path.split("/").slice(0, 4).join("/"), r.status);
          return { status: r.status, data: await r.json() };
        } catch (e) {
          if (attempt) throw e;
        }
      }
    },
  };
}
const tomorrow = new Date();
tomorrow.setUTCDate(tomorrow.getUTCDate() + 2);
const start = tomorrow.toISOString().slice(0, 10);
const last = new Date(tomorrow);
last.setUTCDate(last.getUTCDate() + 20);
const end = last.toISOString().slice(0, 10);
const input = {
  title: "[AUTOMATED TEST] Rental workflow",
  city: "柏林",
  neighborhood: "Test district",
  address: "Private test address - not a real home",
  description:
    "Isolated automated test fixture, not a real property or rental offer.",
  rentalMode: "ROOMS",
  rent: "800.00",
  sizeM2: 60,
  furnished: true,
  availableFrom: start,
  imageKey: "living-room",
  features: ["quiet", "transit"],
  isDemo: false,
  rooms: [
    { name: "A", capacity: 1 },
    { name: "B", capacity: 1 },
  ],
};
try {
  for (const role of ["landlord", "a", "b", "c"]) {
    const s = await session(role);
    const r = await s.request("/api/auth/login", {
      email: "rental-demo-" + role + "@example.com",
      password: process.env.DEMO_ACCOUNT_PASSWORD,
    });
    assert.equal(r.status, 200, "login " + role);
    accounts.push(s);
  }
  const [owner, a, b, c] = accounts;
  const history = await a.request("/api/tenant/charges");
  assert.equal(history.status, 200);
  let r = await a.request("/api/organizer/listings", input);
  assert.equal(r.status, 403);
  r = await owner.request("/api/organizer/listings", input);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const property = r.data;
  assert.equal(property.city, "Berlin");
  properties.push(property.id);
  const [roomA, roomB] = property.rooms;
  r = await a.request("/api/properties/" + property.id);
  assert.equal(r.status, 404, "draft hidden");
  r = await owner.request("/api/organizer/listings/" + property.id, {
    published: true,
    consent: true,
  });
  assert.equal(r.status, 200);
  const detail = await a.request("/api/properties/" + property.id);
  assert.equal(detail.status, 200);
  assert.ok(detail.data.policy);
  assert.ok(
    !JSON.stringify(detail.data).includes(input.address),
    "exact address must remain private",
  );
  const body = {
    roomId: roomA.id,
    start,
    end,
    policyId: detail.data.policy.id,
    consent: true,
  };
  r = await a.request("/api/properties/" + property.id + "/apply", {
    ...body,
    consent: false,
  });
  assert.equal(r.status, 400);
  r = await a.request("/api/properties/" + property.id + "/apply", {
    ...body,
    end: start,
  });
  assert.equal(r.status, 400);
  r = await a.request("/api/properties/" + property.id + "/apply", {
    ...body,
    roomId: "foreign-room",
  });
  assert.equal(r.status, 400);
  const appA = await a.request(
    "/api/properties/" + property.id + "/apply",
    body,
  );
  assert.equal(appA.status, 200);
  const repeat = await a.request(
    "/api/properties/" + property.id + "/apply",
    body,
  );
  assert.equal(repeat.data.id, appA.data.id, "duplicate submit idempotent");
  const appB = await b.request(
    "/api/properties/" + property.id + "/apply",
    body,
  );
  assert.equal(appB.status, 200);
  r = await b.request("/api/rental/applications/" + appA.data.id, {
    decision: "cancel",
  });
  assert.equal(r.status, 403);
  r = await a.request("/api/rental/applications/" + appA.data.id, {
    decision: "approve",
  });
  assert.equal(r.status, 403);
  const results = await Promise.all(
    [appA, appB].map((app) =>
      owner.request("/api/rental/applications/" + app.data.id, {
        decision: "approve",
      }),
    ),
  );
  assert.deepEqual(
    results.map((r) => r.status).sort(),
    [200, 409],
    "concurrent approvals must not overbook",
  );
  const winner = [appA, appB][results.findIndex((r) => r.status === 200)];
  r = await owner.request("/api/rental/applications/" + winner.data.id, {
    decision: "approve",
  });
  assert.equal(r.status, 200);
  let stays = await db.tenancy.findMany({
    where: { propertyId: property.id },
    include: { confirmations: true },
  });
  assert.equal(stays.length, 1);
  assert.equal(stays[0].confirmations.length, 2);
  assert.equal(stays[0].billingStartDate.toISOString().slice(0, 10), start);
  const rejected = [appA, appB][results.findIndex((r) => r.status === 409)];
  r = await owner.request("/api/rental/applications/" + rejected.data.id, {
    decision: "reject",
  });
  assert.equal(r.status, 200);
  r = await c.request("/api/properties/" + property.id + "/apply", {
    ...body,
    roomId: roomB.id,
  });
  assert.equal(r.status, 200);
  const appC = r.data;
  r = await c.request("/api/rental/applications/" + appC.id, {
    decision: "cancel",
  });
  assert.equal(r.status, 200);
  // The next resident starts on the exclusive end and may occupy the same room.
  const nextApp = await c.request("/api/properties/" + property.id + "/apply", {
    ...body,
    start: end,
    end: null,
  });
  assert.equal(nextApp.status, 200);
  r = await owner.request("/api/rental/applications/" + nextApp.data.id, {
    decision: "approve",
  });
  assert.equal(r.status, 200);
  stays = await db.tenancy.findMany({
    where: { propertyId: property.id },
    include: { confirmations: true },
  });
  assert.equal(stays.length, 2);
  assert.ok(stays.every((s) => s.confirmations.length === 2));
  const list = await a.request("/api/rental/applications");
  assert.equal(list.status, 200);
  assert.ok(
    !list.data.some((x) => x.id === appB.data.id),
    "tenant only reads own applications",
  );
  r = await owner.request("/api/organizer/listings/" + property.id, {
    published: false,
    consent: true,
  });
  assert.equal(r.status, 200);
  r = await a.request("/api/properties/" + property.id);
  assert.equal(r.status, 404);
  assert.equal(
    await db.tenancy.count({ where: { propertyId: property.id } }),
    2,
    "unpublishing retains tenancies",
  );
  // Whole-home mode rejects room selection and has one occupancy slot.
  r = await owner.request("/api/organizer/listings", {
    ...input,
    title: input.title + " whole",
    rentalMode: "WHOLE",
    rooms: [],
  });
  assert.equal(r.status, 200);
  const whole = r.data;
  properties.push(whole.id);
  await owner.request("/api/organizer/listings/" + whole.id, {
    published: true,
    consent: true,
  });
  const wholeDetail = await a.request("/api/properties/" + whole.id);
  const wb = { ...body, policyId: wholeDetail.data.policy.id, roomId: null };
  r = await a.request("/api/properties/" + whole.id + "/apply", {
    ...wb,
    roomId: roomA.id,
  });
  assert.equal(r.status, 400);
  r = await a.request("/api/properties/" + whole.id + "/apply", wb);
  assert.equal(r.status, 200);
  await owner.request("/api/rental/applications/" + r.data.id, {
    decision: "approve",
  });
  r = await b.request("/api/properties/" + whole.id + "/apply", wb);
  assert.equal(r.status, 409);
  const after = await a.request("/api/tenant/charges");
  assert.deepEqual(after.data, history.data, "no charges or payments changed");
  console.log(
    "PASS: publish → detail → consent → apply → concurrent approval → occupancy + two confirmations; duplicate, capacity, authorization, cancellation, exclusive dates, unpublish, historical billing intact",
  );
} finally {
  for (const id of properties) {
    await db.ruleConfirmation.deleteMany({
      where: { tenancy: { propertyId: id } },
    });
    await db.tenancy.deleteMany({ where: { propertyId: id } });
    await db.rentalApplication.deleteMany({ where: { propertyId: id } });
    await db.allocationPolicyVersion.deleteMany({ where: { propertyId: id } });
    await db.room.deleteMany({ where: { propertyId: id } });
    await db.property.delete({ where: { id } });
  }
  for (const s of accounts)
    try {
      await s.request("/api/auth/logout", {});
    } catch {}
  await db.$disconnect();
  console.log("Isolated test properties cleaned; existing records retained.");
}
