// Idempotent, additive demo listing. Never updates existing listings or creates occupancy/payments.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const key = "rental-listing-v1:berlin-application-demo";
try {
  const existing = await db.property.findUnique({ where: { demoKey: key } });
  if (existing) {
    console.log("Existing demo listing retained:", existing.id);
  } else {
    const landlord = await db.user.findUnique({
      where: { email: "rental-demo-landlord@example.com" },
    });
    if (landlord?.role !== "LANDLORD")
      throw new Error("DEMO_LANDLORD_REQUIRED");
    const listing = await db.property.create({
      data: {
        demoKey: key,
        landlordId: landlord.id,
        title: "柏林米特区 · 入住申请演示公寓",
        city: "Berlin",
        neighborhood: "Mitte",
        address: "虚构演示地址，不对应真实房屋",
        description:
          "这是用于体验入住申请、房东审批和费用约定的虚构演示公寓。图片仅作示意，不构成真实出租邀约。批准后会保存演示入住记录，租金不在本平台收取。",
        rentalMode: "WHOLE",
        currency: "EUR",
        advertisedRent: "820.00",
        roomCount: 1,
        sizeM2: 42,
        furnished: true,
        availableFrom: new Date("2026-11-01T00:00:00.000Z"),
        imageKey: "living-room",
        features: ["quiet", "transit"],
        isDemo: true,
        isPublished: true,
        policies: {
          create: {
            policyKey: "listing-electricity",
            versionNumber: 1,
            utilityType: "ELECTRICITY",
            allocationMethod: "PERSON_DAYS",
            vacancyResponsibility: "LANDLORD",
            effectiveStart: new Date("2026-11-01T00:00:00.000Z"),
            terms: { scope: "PROPERTY_PERSON_DAYS", tenantPrepayments: "NONE" },
          },
        },
      },
    });
    console.log("Created explicitly fictional application demo:", listing.id);
  }
} finally {
  await db.$disconnect();
}
