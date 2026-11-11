import { z } from "zod";
import { isCalendarDate } from "../utils/date";
export const daySchema = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
  .refine(isCalendarDate, "INVALID_DATE");
export const featureKeys = [
  "quiet",
  "balcony",
  "transit",
  "pets",
  "family",
  "student",
  "park",
  "shortTerm",
] as const;
export const listingInput = z
  .object({
    title: z.string().trim().min(3).max(120),
    city: z.string().trim().min(2).max(80),
    neighborhood: z.string().trim().min(1).max(120),
    address: z.string().trim().min(5).max(240),
    description: z.string().trim().min(20).max(2000),
    rentalMode: z.enum(["WHOLE", "ROOMS"]),
    rent: z
      .string()
      .regex(/^[0-9]{1,6}[.][0-9]{2}$/)
      .refine((s) => Number(s) > 0),
    roomCount: z.number().int().min(1).max(20).default(1),
    sizeM2: z.number().int().min(1).max(10000),
    furnished: z.boolean(),
    availableFrom: daySchema,
    imageKey: z.enum([
      "living-room",
      "sunlit-home",
      "quiet-bedroom",
      "shared-space",
    ]),
    features: z.array(z.enum(featureKeys)).max(8),
    isDemo: z.boolean(),
    rooms: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(60),
            capacity: z.number().int().min(1).max(10),
          })
          .strict(),
      )
      .max(20),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.rentalMode === "ROOMS" && !v.rooms.length)
      ctx.addIssue({
        code: "custom",
        message: "ROOM_REQUIRED",
        path: ["rooms"],
      });
    if (v.rentalMode === "WHOLE" && v.rooms.length)
      ctx.addIssue({
        code: "custom",
        message: "WHOLE_HAS_NO_ROOMS",
        path: ["rooms"],
      });
    if (new Set(v.rooms.map((r) => r.name)).size !== v.rooms.length)
      ctx.addIssue({
        code: "custom",
        message: "DUPLICATE_ROOM_NAME",
        path: ["rooms"],
      });
  });
export const applicationInput = z
  .object({
    roomId: z.string().min(1).max(100).nullable(),
    start: daySchema,
    end: daySchema.nullable(),
    policyId: z.string().min(1).max(100),
    consent: z.literal(true),
  })
  .strict()
  .refine((v) => !v.end || v.end > v.start, {
    message: "INVALID_DATE_RANGE",
    path: ["end"],
  });
export const featureLabels: Record<string, [string, string]> = {
  quiet: ["安静", "quiet"],
  balcony: ["阳台", "balcony"],
  transit: ["近地铁", "near transit"],
  pets: ["宠物友好", "pet friendly"],
  family: ["适合家庭", "family friendly"],
  student: ["适合学生", "student friendly"],
  park: ["近公园", "near park"],
  shortTerm: ["可短租", "short-term ok"],
};
export const policyText = {
  zh: "电费按账期内有效人天比例分摊；未入住日期由房东承担，不向其他租客转嫁。以账单结算总额为起点核对，已付抵扣另列，下一期预付款不计入本期。日期开始日包含、结束日不包含。租金仅为展示价格，本平台暂不收取租金。",
  en: "Electricity is allocated by occupied person-days within each bill period. Unoccupied dates are the landlord’s responsibility. The statement total is reconciled before allocation; credits are separate and next-period advances excluded. Start dates are inclusive and end dates exclusive. Advertised rent is not collected by this platform.",
};
