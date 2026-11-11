import { ensure } from "./demo-records.mjs";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
const needed = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DEMO_ACCOUNT_PASSWORD",
];
for (const key of needed)
  if (!process.env[key]) {
    console.error("Missing configuration: " + key);
    process.exit(1);
  }
assert.ok(
  process.env.DEMO_ACCOUNT_PASSWORD.length >= 12,
  "Use a demo password of at least 12 characters",
);
const auth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
).auth.admin;
const db = new PrismaClient();
const prefix = "rental-demo-v1:";
const stamp = (value) => new Date(value + "T00:00:00Z");
try {
  const remote = [];
  for (let page = 1; ; page++) {
    const { data, error } = await auth.listUsers({ page, perPage: 100 });
    assert.ok(!error, "Cannot list Auth users");
    remote.push(...data.users);
    if (data.users.length < 100) break;
  }
  const users = [];
  for (const [key, role, name] of [
    ["landlord", "LANDLORD", "Demo Landlord"],
    ["a", "TENANT", "Demo Tenant A"],
    ["b", "TENANT", "Demo Tenant B"],
    ["c", "TENANT", "Demo Tenant C"],
  ]) {
    const email = "rental-demo-" + key + "@example.com";
    let account = remote.find((u) => u.email === email);
    if (account)
      assert.equal(
        account.app_metadata?.rentalDemo,
        prefix,
        "Existing Auth account is not ours; stopping",
      );
    else {
      const result = await auth.createUser({
        email,
        password: process.env.DEMO_ACCOUNT_PASSWORD,
        email_confirm: true,
        app_metadata: { rentalDemo: prefix },
      });
      assert.ok(
        !result.error && result.data.user,
        "Cannot create demo Auth account",
      );
      account = result.data.user;
    }
    users.push(
      await ensure(db.user, key, { email, name, role, authUserId: account.id }),
    );
  }
  await db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext('rental-demo-v1'))",
      );
      const house = await ensure(tx.property, "house", {
        landlordId: users[0].id,
        title: "Synthetic demo house / 模拟房屋",
        address: "Demo Berlin (synthetic)",
        rentalMode: "ROOMS",
        currency: "EUR",
      });
      const rooms = [];
      for (const [index, capacity] of [
        [1, 1],
        [2, 2],
      ])
        rooms.push(
          await ensure(tx.room, "room-" + index, {
            propertyId: house.id,
            name: "Demo room " + index,
            capacity,
          }),
        );
      const policy = await ensure(tx.allocationPolicyVersion, "policy", {
        propertyId: house.id,
        policyKey: prefix + "electricity",
        versionNumber: 1,
        utilityType: "ELECTRICITY",
        allocationMethod: "PERSON_DAYS",
        vacancyResponsibility: "PENDING",
        effectiveStart: stamp("2026-09-01"),
        effectiveEnd: null,
        terms: {
          synthetic: true,
          scope: "PROPERTY_PERSON_DAYS",
          tenantPrepayments: "NONE",
        },
      });
      for (let i = 1; i <= 3; i++) {
        const room = rooms[i === 1 ? 0 : 1];
        const start = stamp(i === 3 ? "2026-09-16" : "2026-09-01");
        const common = {
          propertyId: house.id,
          roomId: room.id,
          tenantId: users[i].id,
        };
        const application = await ensure(
          tx.rentalApplication,
          "application-" + i,
          {
            ...common,
            requestedStartDate: start,
            requestedEndDate: null,
            status: "APPROVED",
          },
        );
        const tenancy = await ensure(tx.tenancy, "tenancy-" + i, {
          ...common,
          applicationId: application.id,
          billingStartDate: start,
          billingEndDate: null,
        });
        for (const user of [users[0], users[i]])
          await ensure(
            tx.ruleConfirmation,
            "confirmation-" + i + "-" + user.role,
            {
              tenancyId: tenancy.id,
              policyVersionId: policy.id,
              userId: user.id,
            },
          );
      }
    },
    { timeout: 60000 },
  );
  console.log(
    "Demo Auth accounts linked and synthetic occupancy prepared. Existing charges/payments unchanged.",
  );
  console.log(
    "Sign in with rental-demo-landlord@example.com, rental-demo-a@example.com, rental-demo-b@example.com, rental-demo-c@example.com using the configured password.",
  );
} catch (error) {
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : "Demo initialization failed; retry after checking configuration. Existing records preserved.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
