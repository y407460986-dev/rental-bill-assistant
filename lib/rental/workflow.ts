import "server-only";
import { canonicalCity } from "./cities";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { must } from "@/lib/http";
import { applicationInput, listingInput, policyText } from "./contracts";
import { hasCapacity, overlaps } from "./capacity";
const stamp = (day: string) => new Date(day + "T00:00:00.000Z");
const day = (date: Date) => date.toISOString().slice(0, 10);
const agreementSchema = z.object({
  policyId: z.string(),
  acceptedAt: z.string().datetime(),
  tenantId: z.string(),
  policyFingerprint: z.string(),
  termsCN: z.string(),
  termsEN: z.string(),
});
function fingerprint(policy: {
  id: string;
  terms: Prisma.JsonValue;
  allocationMethod: string;
  vacancyResponsibility: string;
  effectiveStart: Date;
  effectiveEnd: Date | null;
}) {
  return JSON.stringify([
    policy.id,
    policy.terms,
    policy.allocationMethod,
    policy.vacancyResponsibility,
    day(policy.effectiveStart),
    policy.effectiveEnd ? day(policy.effectiveEnd) : null,
  ]);
}
/** One property row lock serializes edit, publish, apply and approval. */
async function lockProperty(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM "Property" WHERE id = ${id} FOR UPDATE`;
  must(rows.length, "NOT_FOUND", 404);
}
type ListingInput = z.infer<typeof listingInput>;

function listingFields(input: ListingInput) {
  return {
    title: input.title,
    address: input.address,
    city: canonicalCity(input.city),
    neighborhood: input.neighborhood,
    description: input.description,
    rentalMode: input.rentalMode,
    advertisedRent: input.rent,
    currency: "EUR" as const,
    roomCount: input.roomCount,
    sizeM2: input.sizeM2,
    furnished: input.furnished,
    availableFrom: stamp(input.availableFrom),
    features: input.features,
    imageKey: input.imageKey,
    isDemo: input.isDemo,
  };
}

export const listingEditInclude = {
  rooms: true,
  policies: { include: { _count: { select: { confirmations: true } } } },
  _count: { select: { applications: true, tenancies: true, bills: true } },
} satisfies Prisma.PropertyInclude;

type EditableListing = Prisma.PropertyGetPayload<{
  include: typeof listingEditInclude;
}>;
export type ListingEditBlockReason =
  "LISTING_PUBLISHED" | "LISTING_IN_USE" | "LEGACY_LISTING_READ_ONLY";

const listingPolicyTerms = {
  scope: "PROPERTY_PERSON_DAYS",
  tenantPrepayments: "NONE",
  termsCN: policyText.zh,
  termsEN: policyText.en,
};
const listingPolicyTermsSchema = z
  .object({
    scope: z.literal(listingPolicyTerms.scope),
    tenantPrepayments: z.literal(listingPolicyTerms.tenantPrepayments),
    termsCN: z.literal(policyText.zh),
    termsEN: z.literal(policyText.en),
  })
  .strict();

/** Shared by collection hints and the authoritative check after acquiring the lock. */
export function listingEditBlockReason(
  property: EditableListing,
): ListingEditBlockReason | null {
  if (property.isPublished) return "LISTING_PUBLISHED";
  if (!property.city) return "LEGACY_LISTING_READ_ONLY";
  if (
    property._count.applications ||
    property._count.tenancies ||
    property._count.bills ||
    property.policies.some((policy) => policy._count.confirmations)
  )
    return "LISTING_IN_USE";
  if (
    property.policies.length > 1 ||
    property.policies.some(
      (policy) =>
        policy.roomId !== null ||
        policy.policyKey !== "listing-electricity" ||
        policy.versionNumber !== 1 ||
        policy.utilityType !== "ELECTRICITY" ||
        policy.allocationMethod !== "PERSON_DAYS" ||
        policy.vacancyResponsibility !== "LANDLORD" ||
        policy.effectiveEnd !== null ||
        !property.availableFrom ||
        day(policy.effectiveStart) !== day(property.availableFrom) ||
        !listingPolicyTermsSchema.safeParse(policy.terms).success,
    )
  )
    return "LEGACY_LISTING_READ_ONLY";
  return null;
}

export async function createListing(
  landlordId: string,
  body: unknown,
  db: PrismaClient = getDb(),
) {
  const input = listingInput.parse(body);
  return db.property.create({
    data: {
      landlordId,
      ...listingFields(input),
      rooms: { create: input.rooms },
    },
    include: { rooms: true },
  });
}

export async function updateListing(
  landlordId: string,
  id: string,
  body: unknown,
  db: PrismaClient = getDb(),
) {
  const input = listingInput.parse(body);
  return db.$transaction(
    async (tx) => {
      await lockProperty(tx, id);
      const property = await tx.property.findUniqueOrThrow({
        where: { id },
        include: listingEditInclude,
      });
      must(property.landlordId === landlordId, "FORBIDDEN", 403);
      const reason = listingEditBlockReason(property);
      must(reason === null, reason ?? "LISTING_IN_USE");

      // All room foreign-key dependants were checked above, including room policies.
      // Delete first so reused room names cannot collide with their previous rows.
      await tx.room.deleteMany({ where: { propertyId: id } });
      if (property.policies.length)
        await tx.allocationPolicyVersion.update({
          where: { id: property.policies[0].id },
          data: { effectiveStart: stamp(input.availableFrom) },
        });
      return tx.property.update({
        where: { id },
        data: {
          ...listingFields(input),
          rooms: { create: input.rooms },
        },
        include: { rooms: true },
      });
    },
    { maxWait: 10000, timeout: 20000 },
  );
}
export async function setPublication(
  landlordId: string,
  id: string,
  published: boolean,
  db: PrismaClient = getDb(),
) {
  return db.$transaction(
    async (tx) => {
      await lockProperty(tx, id);
      const property = await tx.property.findUniqueOrThrow({
        where: { id },
        include: { rooms: true, policies: true },
      });
      must(property.landlordId === landlordId, "FORBIDDEN", 403);
      if (published) {
        must(
          property.city &&
            property.neighborhood &&
            property.description &&
            property.availableFrom &&
            property.sizeM2 &&
            property.advertisedRent?.gt(0),
          "LISTING_INCOMPLETE",
        );
        must(property.currency === "EUR", "CURRENCY_UNSUPPORTED");
        must(
          property.rentalMode === "WHOLE" || property.rooms.length,
          "ROOM_REQUIRED",
        );
        if (!property.policies.length)
          await tx.allocationPolicyVersion.create({
            data: {
              propertyId: id,
              policyKey: "listing-electricity",
              versionNumber: 1,
              utilityType: "ELECTRICITY",
              allocationMethod: "PERSON_DAYS",
              vacancyResponsibility: "LANDLORD",
              effectiveStart: property.availableFrom!,
              terms: listingPolicyTerms,
            },
          });
        else
          must(
            property.policies.length === 1 &&
              property.policies[0].policyKey === "listing-electricity",
            "LEGACY_POLICY_REQUIRES_REVIEW",
          );
      }
      return tx.property.update({
        where: { id },
        data: { isPublished: published },
      });
    },
    { maxWait: 10000, timeout: 20000 },
  );
}
export async function applyForListing(
  tenantId: string,
  propertyId: string,
  body: unknown,
  db: PrismaClient = getDb(),
) {
  const input = applicationInput.parse(body);
  return db.$transaction(
    async (tx) => {
      await lockProperty(tx, propertyId);
      const p = await tx.property.findUniqueOrThrow({
        where: { id: propertyId },
        include: { rooms: true, policies: true },
      });
      must(
        p.isPublished && !p.isDemo && p.city && p.description,
        "LISTING_UNAVAILABLE",
        404,
      );
      must(p.landlordId !== tenantId, "FORBIDDEN", 403);
      must(
        p.availableFrom && input.start >= day(p.availableFrom),
        "BEFORE_AVAILABLE_DATE",
      );
      must(
        input.start >= new Date().toISOString().slice(0, 10),
        "START_IN_PAST",
      );
      const room = p.rooms.find((r) => r.id === input.roomId);
      must(
        p.rentalMode === "WHOLE" ? !input.roomId : !!room,
        "INVALID_ROOM",
        400,
      );
      const policy = p.policies.find((v) => v.id === input.policyId);
      must(
        policy &&
          policy.policyKey === "listing-electricity" &&
          day(policy.effectiveStart) <= input.start &&
          (!policy.effectiveEnd ||
            (input.end && input.end <= day(policy.effectiveEnd))),
        "POLICY_CHANGED",
      );
      const previous = await tx.rentalApplication.findMany({
        where: {
          tenantId,
          propertyId,
          status: { in: ["PENDING", "APPROVED"] },
        },
      });
      const same = previous.find(
        (a) =>
          a.roomId === input.roomId &&
          day(a.requestedStartDate) === input.start &&
          (a.requestedEndDate ? day(a.requestedEndDate) : null) === input.end,
      );
      if (same) return same;
      must(
        !previous.some((a) =>
          overlaps(
            {
              start: day(a.requestedStartDate),
              end: a.requestedEndDate ? day(a.requestedEndDate) : null,
            },
            input,
          ),
        ),
        "DUPLICATE_APPLICATION",
      );
      const stays = await tx.tenancy.findMany({ where: { propertyId } });
      const relevant = stays.filter(
        (t) =>
          p.rentalMode === "WHOLE" || t.roomId === input.roomId || !t.roomId,
      );
      must(
        hasCapacity(
          relevant.map((t) => ({
            start: day(t.billingStartDate),
            end: t.billingEndDate ? day(t.billingEndDate) : null,
          })),
          input,
          p.rentalMode === "WHOLE" ? 1 : room!.capacity,
        ),
        "NO_CAPACITY",
      );
      return tx.rentalApplication.create({
        data: {
          tenantId,
          propertyId,
          roomId: input.roomId,
          requestedStartDate: stamp(input.start),
          requestedEndDate: input.end ? stamp(input.end) : null,
          agreement: {
            policyId: policy.id,
            tenantId,
            acceptedAt: new Date().toISOString(),
            policyFingerprint: fingerprint(policy),
            termsCN: policyText.zh,
            termsEN: policyText.en,
          },
        },
      });
    },
    { maxWait: 10000, timeout: 20000 },
  );
}
export async function decideApplication(
  userId: string,
  id: string,
  decision: "approve" | "reject" | "cancel",
  db: PrismaClient = getDb(),
) {
  return db.$transaction(
    async (tx) => {
      const initial = await tx.rentalApplication.findUnique({ where: { id } });
      must(initial, "NOT_FOUND", 404);
      await lockProperty(tx, initial.propertyId);
      const app = await tx.rentalApplication.findUniqueOrThrow({
        where: { id },
        include: { property: { include: { rooms: true } }, tenancy: true },
      });
      must(
        decision === "cancel"
          ? app.tenantId === userId
          : app.property.landlordId === userId,
        "FORBIDDEN",
        403,
      );
      const target =
        decision === "approve"
          ? "APPROVED"
          : decision === "reject"
            ? "REJECTED"
            : "CANCELLED";
      if (app.status === target) return app;
      must(app.status === "PENDING", "APPLICATION_FINAL");
      if (decision === "approve") {
        must(app.property.isPublished, "LISTING_UNAVAILABLE");
        const agreement = agreementSchema.safeParse(app.agreement);
        must(
          agreement.success && agreement.data.tenantId === app.tenantId,
          "CONSENT_REQUIRED",
        );
        const policy = await tx.allocationPolicyVersion.findUnique({
          where: { id: agreement.data.policyId },
        });
        must(
          policy &&
            policy.propertyId === app.propertyId &&
            fingerprint(policy) === agreement.data.policyFingerprint,
          "POLICY_CHANGED",
        );
        const requested = {
          start: day(app.requestedStartDate),
          end: app.requestedEndDate ? day(app.requestedEndDate) : null,
        };
        must(
          requested.start >= new Date().toISOString().slice(0, 10),
          "START_IN_PAST",
        );
        const room = app.property.rooms.find((r) => r.id === app.roomId);
        must(
          app.property.rentalMode === "WHOLE" ? !app.roomId : !!room,
          "INVALID_ROOM",
        );
        const stays = await tx.tenancy.findMany({
          where: { propertyId: app.propertyId },
        });
        must(
          !stays.some(
            (t) =>
              t.tenantId === app.tenantId &&
              overlaps(
                {
                  start: day(t.billingStartDate),
                  end: t.billingEndDate ? day(t.billingEndDate) : null,
                },
                requested,
              ),
          ),
          "DUPLICATE_TENANCY",
        );
        const relevant = stays.filter(
          (t) =>
            app.property.rentalMode === "WHOLE" ||
            t.roomId === app.roomId ||
            !t.roomId,
        );
        must(
          hasCapacity(
            relevant.map((t) => ({
              start: day(t.billingStartDate),
              end: t.billingEndDate ? day(t.billingEndDate) : null,
            })),
            requested,
            app.property.rentalMode === "WHOLE" ? 1 : room!.capacity,
          ),
          "NO_CAPACITY",
        );
        await tx.tenancy.create({
          data: {
            applicationId: id,
            propertyId: app.propertyId,
            roomId: app.roomId,
            tenantId: app.tenantId,
            billingStartDate: app.requestedStartDate,
            billingEndDate: app.requestedEndDate,
            confirmations: {
              create: [
                {
                  policyVersionId: policy.id,
                  userId: app.tenantId,
                  confirmedAt: new Date(agreement.data.acceptedAt),
                },
                { policyVersionId: policy.id, userId: app.property.landlordId },
              ],
            },
          },
        });
      }
      return tx.rentalApplication.update({
        where: { id },
        data: { status: target },
        include: { tenancy: true },
      });
    },
    { maxWait: 10000, timeout: 20000 },
  );
}
