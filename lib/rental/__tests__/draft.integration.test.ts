import { randomUUID } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { expect, it, vi } from "vitest";
import { ZodError } from "zod";
vi.mock("server-only", () => ({}));
import {
  applyForListing,
  createListing,
  listingEditBlockReason,
  listingEditInclude,
  setPublication,
  updateListing,
} from "../workflow";

const initialInput = {
  title: "Original rental draft",
  city: "Berlin",
  neighborhood: "Mitte",
  address: "Synthetic address 12",
  description: "A synthetic rental description for the database regression.",
  rentalMode: "ROOMS" as const,
  rent: "750.00",
  roomCount: 2,
  sizeM2: 64,
  furnished: false,
  availableFrom: "2099-01-01",
  imageKey: "quiet-bedroom" as const,
  features: ["quiet", "student"],
  isDemo: true,
  rooms: [
    { name: "Room A", capacity: 1 },
    { name: "Room B", capacity: 2 },
  ],
};

it("real DB: draft persistence, room transitions, authorization, blockers and republish policy dates; rolls back", async () => {
  const db = new PrismaClient();
  const marker = randomUUID();
  const rollback = new Error("ROLLBACK_DRAFT_TEST");
  try {
    await db.$transaction(
      async (tx) => {
        // Services use the real transaction and SQL locks, inside one rollback-only fixture.
        const serviceDb = new Proxy(tx, {
          get(target, key) {
            if (key === "$transaction")
              return async (
                action: (client: Prisma.TransactionClient) => unknown,
              ) => action(tx);
            return Reflect.get(target, key);
          },
        }) as unknown as PrismaClient;
        const owner = await tx.user.create({
          data: {
            email: marker + "-owner@example.invalid",
            name: "Draft test owner",
            role: "LANDLORD",
          },
        });
        const outsider = await tx.user.create({
          data: {
            email: marker + "-outsider@example.invalid",
            name: "Other landlord",
            role: "LANDLORD",
          },
        });
        const tenant = await tx.user.create({
          data: {
            email: marker + "-tenant@example.invalid",
            name: "Draft test tenant",
            role: "TENANT",
          },
        });
        const load = (id: string) =>
          tx.property.findUniqueOrThrow({
            where: { id },
            include: listingEditInclude,
          });
        const assertBlocked = async (
          id: string,
          reason:
            "LISTING_PUBLISHED" | "LISTING_IN_USE" | "LEGACY_LISTING_READ_ONLY",
        ) => {
          const before = await load(id);
          expect(listingEditBlockReason(before)).toBe(reason);
          await expect(
            updateListing(owner.id, id, initialInput, serviceDb),
          ).rejects.toMatchObject({ code: reason, status: 409 });
          expect(await load(id)).toEqual(before);
        };
        const property = await createListing(owner.id, initialInput, serviceDb);
        expect(listingEditBlockReason(await load(property.id))).toBeNull();
        const editedInput = {
          ...initialInput,
          title: "Updated rental draft",
          address: "New synthetic address 34",
          neighborhood: "Prenzlauer Berg",
          description:
            "An updated synthetic description with all edited fields preserved.",
          rent: "845.67",
          roomCount: 3,
          sizeM2: 89,
          furnished: true,
          city: "汉堡",
          availableFrom: "2099-02-03",
          features: ["balcony", "pets", "transit"],
          imageKey: "sunlit-home" as const,
          isDemo: false,
          rooms: [
            { name: "Room B", capacity: 3 },
            { name: "Room C", capacity: 1 },
          ],
        };
        const edited = await updateListing(
          owner.id,
          property.id,
          editedInput,
          serviceDb,
        );
        expect(edited.id).toBe(property.id);
        const persisted = await load(property.id);
        expect(persisted).toMatchObject({
          id: property.id,
          landlordId: owner.id,
          title: editedInput.title,
          address: editedInput.address,
          city: "Hamburg",
          neighborhood: editedInput.neighborhood,
          description: editedInput.description,
          rentalMode: "ROOMS",
          currency: "EUR",
          roomCount: 3,
          sizeM2: 89,
          furnished: true,
          availableFrom: new Date("2099-02-03T00:00:00Z"),
          features: editedInput.features,
          imageKey: "sunlit-home",
          isDemo: false,
          isPublished: false,
        });
        expect(persisted.advertisedRent?.toFixed(2)).toBe("845.67");
        expect(
          persisted.rooms
            .map(({ name, capacity }) => ({ name, capacity }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ).toEqual(editedInput.rooms);
        expect(
          await tx.property.count({ where: { landlordId: owner.id } }),
        ).toBe(1);

        const wholeInput = {
          ...editedInput,
          rentalMode: "WHOLE" as const,
          rooms: [],
          rent: "1700.25",
          availableFrom: "2099-03-04",
          features: ["family", "park"],
        };
        await updateListing(owner.id, property.id, wholeInput, serviceDb);
        const whole = await load(property.id);
        expect(whole).toMatchObject({
          rentalMode: "WHOLE",
          rooms: [],
          features: ["family", "park"],
          isDemo: false,
        });
        expect(whole.advertisedRent?.toFixed(2)).toBe("1700.25");
        expect(whole.availableFrom?.toISOString().slice(0, 10)).toBe(
          "2099-03-04",
        );
        await updateListing(owner.id, property.id, editedInput, serviceDb);
        expect((await load(property.id)).rooms).toHaveLength(2);

        const beforeDenied = await load(property.id);
        await expect(
          updateListing(outsider.id, property.id, initialInput, serviceDb),
        ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
        expect(await load(property.id)).toEqual(beforeDenied);
        await expect(
          updateListing(owner.id, marker + "-missing", initialInput, serviceDb),
        ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
        for (const invalid of [
          { ...editedInput, title: "x" },
          { ...editedInput, rent: "0.00" },
          { ...editedInput, rent: "123.456" },
          { ...editedInput, availableFrom: "2099-02-30" },
          { ...editedInput, rentalMode: "WHOLE" },
          { ...editedInput, rooms: [] },
          {
            ...editedInput,
            rooms: [
              { name: "Same", capacity: 1 },
              { name: "Same", capacity: 2 },
            ],
          },
          { ...editedInput, rooms: [{ name: "Room", capacity: 0 }] },
          { ...editedInput, features: ["unknown"] },
          { ...editedInput, landlordId: outsider.id },
        ]) {
          await expect(
            updateListing(owner.id, property.id, invalid, serviceDb),
          ).rejects.toBeInstanceOf(ZodError);
          expect(await load(property.id)).toEqual(beforeDenied);
        }

        await setPublication(owner.id, property.id, true, serviceDb);
        await assertBlocked(property.id, "LISTING_PUBLISHED");
        const originalPolicy = (await load(property.id)).policies[0];
        await setPublication(owner.id, property.id, false, serviceDb);
        expect(listingEditBlockReason(await load(property.id))).toBeNull();
        await updateListing(owner.id, property.id, wholeInput, serviceDb);
        const revisedPolicy = (await load(property.id)).policies[0];
        expect(revisedPolicy).toEqual({
          ...originalPolicy,
          effectiveStart: new Date("2099-03-04T00:00:00Z"),
        });
        await setPublication(owner.id, property.id, true, serviceDb);
        expect((await load(property.id)).policies).toEqual([revisedPolicy]);
        await expect(
          applyForListing(
            tenant.id,
            property.id,
            {
              roomId: null,
              start: "2099-03-03",
              end: null,
              policyId: revisedPolicy.id,
              consent: true,
            },
            serviceDb,
          ),
        ).rejects.toMatchObject({ code: "BEFORE_AVAILABLE_DATE" });
        const application = await applyForListing(
          tenant.id,
          property.id,
          {
            roomId: null,
            start: "2099-03-04",
            end: null,
            policyId: revisedPolicy.id,
            consent: true,
          },
          serviceDb,
        );
        expect(application.propertyId).toBe(property.id);
        await setPublication(owner.id, property.id, false, serviceDb);
        await tx.rentalApplication.update({
          where: { id: application.id },
          data: { status: "CANCELLED" },
        });
        await assertBlocked(property.id, "LISTING_IN_USE");

        const legacy = await tx.property.create({
          data: {
            landlordId: owner.id,
            title: "Historical property",
            address: "Synthetic legacy",
            rentalMode: "ROOMS",
          },
        });
        await assertBlocked(legacy.id, "LEGACY_LISTING_READ_ONLY");
        const roomPolicyProperty = await createListing(
          owner.id,
          initialInput,
          serviceDb,
        );
        await setPublication(owner.id, roomPolicyProperty.id, true, serviceDb);
        await setPublication(owner.id, roomPolicyProperty.id, false, serviceDb);
        const roomPolicy = (await load(roomPolicyProperty.id)).policies[0];
        // Even the expected key must not permit deletion of a room-linked policy.
        await tx.allocationPolicyVersion.update({
          where: { id: roomPolicy.id },
          data: { roomId: roomPolicyProperty.rooms[0].id },
        });
        await assertBlocked(roomPolicyProperty.id, "LEGACY_LISTING_READ_ONLY");
        await tx.allocationPolicyVersion.update({
          where: { id: roomPolicy.id },
          data: { roomId: null, policyKey: "historical-electricity" },
        });
        await assertBlocked(roomPolicyProperty.id, "LEGACY_LISTING_READ_ONLY");
        await tx.allocationPolicyVersion.update({
          where: { id: roomPolicy.id },
          data: {
            policyKey: "listing-electricity",
            terms: { unexpected: true },
          },
        });
        await assertBlocked(roomPolicyProperty.id, "LEGACY_LISTING_READ_ONLY");
        await tx.allocationPolicyVersion.update({
          where: { id: roomPolicy.id },
          data: {
            terms: roomPolicy.terms as Prisma.InputJsonValue,
            versionNumber: 2,
          },
        });
        await assertBlocked(roomPolicyProperty.id, "LEGACY_LISTING_READ_ONLY");

        const billed = await createListing(owner.id, initialInput, serviceDb);
        const sourceDocument = await tx.sourceDocument.create({
          data: {
            landlordId: owner.id,
            fileUrl: "private://draft-regression",
            fileHash: marker,
            isSynthetic: true,
          },
        });
        const bill = await tx.bill.create({
          data: {
            propertyId: billed.id,
            roomId: billed.rooms[0].id,
            utilityType: "ELECTRICITY",
            sourceDocumentId: sourceDocument.id,
          },
        });
        await assertBlocked(billed.id, "LISTING_IN_USE");
        expect(
          await tx.bill.findUniqueOrThrow({ where: { id: bill.id } }),
        ).toEqual(bill);

        const occupied = await createListing(owner.id, initialInput, serviceDb);
        const stayApplication = await tx.rentalApplication.create({
          data: {
            propertyId: occupied.id,
            roomId: occupied.rooms[0].id,
            tenantId: tenant.id,
            requestedStartDate: new Date("2099-01-01T00:00:00Z"),
            status: "APPROVED",
          },
        });
        const tenancy = await tx.tenancy.create({
          data: {
            propertyId: occupied.id,
            roomId: occupied.rooms[0].id,
            applicationId: stayApplication.id,
            tenantId: tenant.id,
            billingStartDate: new Date("2099-01-01T00:00:00Z"),
          },
        });
        await assertBlocked(occupied.id, "LISTING_IN_USE");
        expect(
          await tx.tenancy.findUniqueOrThrow({ where: { id: tenancy.id } }),
        ).toEqual(tenancy);

        // A policy confirmation alone blocks editing, even if its tenancy is elsewhere.
        const confirmed = await createListing(
          owner.id,
          initialInput,
          serviceDb,
        );
        await setPublication(owner.id, confirmed.id, true, serviceDb);
        await setPublication(owner.id, confirmed.id, false, serviceDb);
        const confirmedPolicy = (await load(confirmed.id)).policies[0];
        const confirmation = await tx.ruleConfirmation.create({
          data: {
            policyVersionId: confirmedPolicy.id,
            tenancyId: tenancy.id,
            userId: owner.id,
          },
        });
        const confirmedBefore = await load(confirmed.id);
        expect(confirmedBefore._count).toEqual({
          applications: 0,
          tenancies: 0,
          bills: 0,
        });
        await assertBlocked(confirmed.id, "LISTING_IN_USE");
        expect(
          await tx.ruleConfirmation.findUniqueOrThrow({
            where: { id: confirmation.id },
          }),
        ).toEqual(confirmation);
        throw rollback;
      },
      { timeout: 300000, maxWait: 30000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    try {
      expect(
        await db.user.count({ where: { email: { contains: marker } } }),
      ).toBe(0);
    } finally {
      await db.$disconnect();
    }
  }
}, 330000);
