import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { must, AppError } from "@/lib/http";
import { parseExtraction, reconcile } from "@/lib/contracts/extraction";
import { allocate } from "@/lib/calculator/allocate";
import { calendarDays, isCalendarDate } from "@/lib/utils/date";
import { MoneyDecimal } from "@/lib/utils/decimal";
import { ownedBill } from "./access";
import { extract } from "@/lib/ai/extract";
import { readBillText } from "@/lib/ai/ocr-read";
import { isOcrIssue, verifyExtractionAgainstOcr } from "@/lib/ai/ocr-verify";
import { readEvidence } from "@/lib/storage/server";
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const day = (value: Date) => value.toISOString().slice(0, 10);
const settlementSchema = z
  .object({
    supplierAdvancePaidPreviously: z.literal(true),
    lineItemsReferenceOnly: z.literal(true),
    acknowledgedIssues: z.array(z.string()).max(150),
  })
  .strict();
const manualReviewSchema = z.object({
  userId: z.string(),
  at: z.string().datetime(),
  start: z.string(),
  end: z.string(),
  note: z.string().min(5),
  settlement: settlementSchema,
});
export async function calculation(
  tx: Prisma.TransactionClient,
  billId: string,
  versionId: string,
) {
  const version = await tx.billVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: {
      bill: {
        include: { sourceDocument: true, property: true, contributions: true },
      },
    },
  });
  must(version.billId === billId, "VERSION_MISMATCH");
  const bill = version.bill;
  const data = parseExtraction(version.extractedLineItems);
  const rawIssues = reconcile(data);
  must(!bill.roomId && bill.utilityType === "ELECTRICITY", "SCOPE_UNSUPPORTED");

  // The statement's own currency drives the charges. PayPal support is checked
  // here so an unsupported statement cannot generate payable rows.
  // The statement's own currency drives the charges; there is no currency
  // whitelist here, PayPal rejects what it cannot settle at order creation.
  must(data.currency !== null, "CURRENCY_MISSING");
  const currency = data.currency;
  // Service-period issues are never policy-ignorable, and every query below
  // needs a usable [start, end) window. Fail fast here so a missing period
  // surfaces as RECONCILIATION_REQUIRED instead of a database error caused
  // by constructing dates from null.
  must(
    data.servicePeriodStart !== null &&
      data.servicePeriodEnd !== null &&
      !rawIssues.some(
        (issue) =>
          issue === "SERVICE_PERIOD_MISSING" ||
          issue === "SERVICE_PERIOD_INVALID",
      ),
    "RECONCILIATION_REQUIRED",
  );
  const start = new Date(data.servicePeriodStart + "T00:00:00Z"),
    end = new Date(data.servicePeriodEnd + "T00:00:00Z");
  const tenancies = await tx.tenancy.findMany({
    where: {
      propertyId: bill.propertyId,
      billingStartDate: { lt: end },
      OR: [{ billingEndDate: null }, { billingEndDate: { gt: start } }],
    },
    orderBy: { id: "asc" },
    include: { application: true, confirmations: { orderBy: { id: "asc" } } },
  });
  const policies = await tx.allocationPolicyVersion.findMany({
    where: {
      propertyId: bill.propertyId,
      utilityType: bill.utilityType,
      effectiveStart: { lt: end },
      OR: [{ effectiveEnd: null }, { effectiveEnd: { gt: start } }],
    },
    orderBy: { id: "asc" },
  });
  must(policies.length === 1, "POLICY_MISSING_OR_OVERLAPPING");
  const policy = policies[0];
  must(
    !policy.roomId &&
      policy.effectiveStart <= start &&
      (!policy.effectiveEnd || policy.effectiveEnd >= end),
    "POLICY_SCOPE_UNSUPPORTED",
  );
  const terms = policy.terms as Record<string, unknown>;
  must(
    terms.scope === "PROPERTY_PERSON_DAYS" &&
      terms.tenantPrepayments === "NONE" &&
      policy.allocationMethod === "PERSON_DAYS",
    "POLICY_UNSUPPORTED",
  );
  const reviewSnapshot = z
    .object({ audit: z.object({ manual: z.unknown() }) })
    .safeParse(version.snapshot);
  const manual = manualReviewSchema.safeParse(
    reviewSnapshot.success ? reviewSnapshot.data.audit.manual : undefined,
  );
  const supplemental =
    manual.success &&
    manual.data.userId === bill.property.landlordId &&
    manual.data.start === data.servicePeriodStart &&
    manual.data.end === data.servicePeriodEnd
      ? manual.data
      : null;
  // A per-bill demo agreement can acknowledge source warnings, never an
  // invalid period, missing evidence, or broken settlement arithmetic.
  const machineBlockers = reconcile({ ...data, issues: [] }).filter(
    (issue) =>
      issue !== "LINE_ITEMS_MISSING" &&
      issue !== "LINE_ITEMS_TOTAL_MISMATCH" &&
      !issue.startsWith("TAX_LINE_MISMATCH:"),
  );
  const referenceOnlyLineItems =
    terms.lineItemsUsage === "REFERENCE_ONLY" || supplemental !== null;
  const ignoredIssues = rawIssues.filter(
    (issue) =>
      !isOcrIssue(issue) &&
      ((referenceOnlyLineItems &&
        (issue === "LINE_ITEMS_MISSING" ||
          issue === "LINE_ITEMS_TOTAL_MISMATCH" ||
          issue.startsWith("TAX_LINE_MISMATCH:"))) ||
        (supplemental?.settlement.acknowledgedIssues.includes(issue) &&
          !machineBlockers.includes(issue))),
  );
  const issues = rawIssues.filter((issue) => !ignoredIssues.includes(issue));
  must(issues.length === 0, "RECONCILIATION_REQUIRED");
  const supplierAdvancePaidPreviously =
    terms.supplierAdvanceHandling === "PREVIOUS_PERIOD_PAID" ||
    supplemental !== null;
  const allocationAmount = supplierAdvancePaidPreviously
    ? data.amountDue
    : data.settlementTotal;
  must(
    allocationAmount !== null && new MoneyDecimal(allocationAmount).gt(0),
    "ALLOCATION_BASE_MISSING",
  );
  if (supplierAdvancePaidPreviously) {
    must(bill.contributions.length === 0, "PREPAYMENT_UNSUPPORTED");
  } else {
    must(
      data.advancePayments !== null &&
        new MoneyDecimal(data.advancePayments).isZero() &&
        bill.contributions.length === 0,
      "PREPAYMENT_UNSUPPORTED",
    );
  }
  must(
    tenancies.length > 0 &&
      new Set(tenancies.map((t) => t.tenantId)).size === tenancies.length,
    "MULTIPLE_INTERVALS_UNSUPPORTED",
  );
  for (const t of tenancies) {
    must(
      t.application.status === "APPROVED" &&
        t.application.tenantId === t.tenantId &&
        t.application.propertyId === t.propertyId &&
        t.application.roomId === t.roomId,
      "TENANCY_APPLICATION_MISMATCH",
    );
    must(
      [bill.property.landlordId, t.tenantId].every((id) =>
        t.confirmations.some(
          (c) => c.policyVersionId === policy.id && c.userId === id,
        ),
      ),
      "RULE_CONFIRMATION_MISSING",
    );
  }
  const result = allocate({
    amount: allocationAmount,
    currency,
    method: policy.allocationMethod,
    servicePeriodStart: data.servicePeriodStart,
    servicePeriodEnd: data.servicePeriodEnd,
    vacancyResponsibility: policy.vacancyResponsibility,
    tenancies: tenancies.map((t) => ({
      tenantId: t.tenantId,
      billingStartDate: day(t.billingStartDate),
      billingEndDate: t.billingEndDate ? day(t.billingEndDate) : null,
    })),
  });
  must(
    new MoneyDecimal(result.landlordShare)
      .plus(
        result.charges.reduce(
          (s, c) => s.plus(c.actualShare),
          new MoneyDecimal(0),
        ),
      )
      .equals(result.total),
    "ALLOCATION_MISMATCH",
  );
  const snapshot = json({
    algorithm: "person-days-v1",
    source: { id: bill.sourceDocumentId, hash: bill.sourceDocument.fileHash },
    data,
    reconciliation: {
      issues,
      ignoredIssues,
      allocationBase: allocationAmount,
      supplierAdvanceHandling: supplierAdvancePaidPreviously
        ? "PREVIOUS_PERIOD_PAID"
        : "NONE",
    },
    tenancies,
    policy,
    contributions: bill.contributions,
    supplementalAgreement: supplemental,
    result,
  });
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex");
  return {
    version,
    snapshot,
    fingerprint,
    result,
    tenancies,
    allocationAmount,
    supplierAdvancePaidPreviously,
    supplementalAgreement: supplemental,
  };
}
async function writeDraft(
  tx: Prisma.TransactionClient,
  billId: string,
  versionId: string,
  leaseToken?: string,
) {
  await tx.$queryRaw`SELECT id FROM "Bill" WHERE id=${billId} FOR UPDATE`;
  if (leaseToken) {
    await tx.$queryRaw`SELECT id FROM "ProcessingJob" WHERE "billId"=${billId} FOR UPDATE`;
    const job = await tx.processingJob.findUniqueOrThrow({
      where: { billId },
    });
    must(
      job.leaseToken === leaseToken &&
        job.leaseUntil &&
        job.leaseUntil > new Date(),
      "PROCESSING_LEASE_EXPIRED",
    );
  }
  const current = await tx.billVersion.findUniqueOrThrow({
    where: { id: versionId },
  });
  must(["DRAFT", "READY"].includes(current.status), "VERSION_IMMUTABLE");
  const latest = await tx.billVersion.findFirst({
    where: { billId },
    orderBy: { versionNumber: "desc" },
  });
  must(latest?.id === versionId, "STALE_VERSION");
  const c = await calculation(tx, billId, versionId);
  await tx.charge.deleteMany({ where: { billVersionId: versionId } });
  for (const row of c.result.charges) {
    const tenancy = c.tenancies.find((t) => t.tenantId === row.tenantId)!;
    await tx.charge.create({
      data: {
        ...row,
        billVersionId: versionId,
        tenancyId: tenancy.id,
        currency: c.result.currency,
        calculationDetails: json(c.result),
        explanationCN: c.supplementalAgreement
          ? `演示补充约定（非原件提取）：账期 [${c.supplementalAgreement.start}, ${c.supplementalAgreement.end})；供应商预付款视为上月已付，仅分摊补缴余额，下一期预付款不计入。明细冲突保留供核对。在住 ${row.daysOccupied} 天，应付 ${c.result.currency} ${row.actualShare}。依据：${c.supplementalAgreement.note}`
          : c.supplierAdvancePaidPreviously
            ? `在住 ${row.daysOccupied} 天，按已确认的人天规则分摊本期补缴余额 ${c.result.currency} ${row.actualShare}；供应商预付款已在上月支付。`
            : `在住 ${row.daysOccupied} 天，按已确认的人天规则分摊 ${c.result.currency} ${row.actualShare}；无租客预付款。`,
        explanationEN: c.supplementalAgreement
          ? `Supplemental demo agreement, not extracted evidence: [${c.supplementalAgreement.start}, ${c.supplementalAgreement.end}); supplier advances treated as previously paid; allocate only the balance, excluding next-period advances. Detail discrepancies remain available for review. ${row.daysOccupied} occupied days; ${c.result.currency} ${row.actualShare} due. Basis: ${c.supplementalAgreement.note}`
          : c.supplierAdvancePaidPreviously
            ? `${row.daysOccupied} occupied days; agreed person-day share of the current balance ${c.result.currency} ${row.actualShare}; supplier advances were paid in the previous month.`
            : `${row.daysOccupied} occupied days; agreed person-day allocation ${c.result.currency} ${row.actualShare}; no tenant prepayments.`,
      },
    });
  }
  await tx.billVersion.update({
    where: { id: versionId },
    data: {
      status: "READY",
      allocationBase: c.result.total,
      landlordShare: c.result.landlordShare,
      reconciliationIssues: [],
      snapshot: {
        ...(c.snapshot as Record<string, Prisma.InputJsonValue>),
        audit:
          (current.snapshot as Record<string, Prisma.InputJsonValue> | null)
            ?.audit ?? null,
      },
      inputFingerprint: c.fingerprint,
    },
  });
  return { versionId, fingerprint: c.fingerprint };
}
export async function generateDraft(
  billId: string,
  versionId: string,
  leaseToken?: string,
) {
  return getDb().$transaction(
    (tx) => writeDraft(tx, billId, versionId, leaseToken),
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 30000,
    },
  );
}
export async function processBill(
  id: string,
  landlordId: string,
  // Leave 15 seconds below the route's 120-second platform limit for cleanup.
  deadlineAt = Date.now() + 105000,
) {
  const db = getDb();
  const bill = await ownedBill(id, landlordId);
  must(
    !bill.versions.some((v) => v.status === "PUBLISHED"),
    "VERSION_IMMUTABLE",
  );
  must(bill.processing, "PROCESSING_JOB_MISSING");
  if (bill.processing.status === "READY") return { status: "READY" };
  const token = randomUUID();
  const now = new Date();
  const claimed = await db.processingJob.updateMany({
    where: {
      billId: id,
      // A delayed request must not claim a job another request already finished.
      status: bill.processing.status,
      attempts: bill.processing.attempts,
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: {
      status: "PROCESSING",
      leaseToken: token,
      leaseUntil: new Date(now.getTime() + 120000),
      attempts: { increment: 1 },
      errorCode: null,
    },
  });
  must(claimed.count === 1, "PROCESSING_IN_PROGRESS");
  let stage = "read_evidence";
  try {
    must(bill.sourceDocument.storagePath, "EVIDENCE_MISSING");
    const evidence = await readEvidence(bill.sourceDocument.storagePath);
    stage = "extract";
    const extractionTime = Math.min(80000, deadlineAt - Date.now() - 15000);
    must(extractionTime > 0, "PROCESSING_DEADLINE_EXCEEDED", 504);
    const extracted = await extract(evidence, extractionTime);
    // Checkpoint before starting optional OCR. If the process is killed, this
    // version remains review-blocked, never an unchecked publishable draft.
    const originalIssues = extracted.data.issues;
    extracted.data.issues = [...originalIssues, "OCR_READ_FAILED"];
    let issues = reconcile(extracted.data);
    stage = "save_extraction";
    const version = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Bill" WHERE id=${id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "ProcessingJob" WHERE "billId"=${id} FOR UPDATE`;
        const job = await tx.processingJob.findUniqueOrThrow({
          where: { billId: id },
        });
        must(job.leaseToken === token, "PROCESSING_LEASE_EXPIRED");
        must(
          job.leaseUntil && job.leaseUntil > new Date(),
          "PROCESSING_LEASE_EXPIRED",
        );
        must(
          !(await tx.billVersion.findFirst({
            where: { billId: id, status: "PUBLISHED" },
          })),
          "VERSION_IMMUTABLE",
        );
        const count = await tx.billVersion.count({ where: { billId: id } });
        const data = extracted.data;
        if (data.syntheticLabelPresent && !bill.sourceDocument.isSynthetic) {
          await tx.sourceDocument.update({
            where: { id: bill.sourceDocument.id },
            data: { isSynthetic: true },
          });
        }
        const saved = await tx.billVersion.create({
          data: {
            billId: id,
            versionNumber: count + 1,
            currency: data.currency || "EUR",
            settlementTotal: data.settlementTotal,
            advancePayments: data.advancePayments,
            amountDue: data.amountDue,
            nextPeriodAdvance: data.nextPeriodAdvance,
            servicePeriodStart:
              data.servicePeriodStart &&
              isCalendarDate(data.servicePeriodStart) &&
              !issues.includes("SERVICE_PERIOD_INVALID")
                ? new Date(data.servicePeriodStart + "T00:00:00Z")
                : null,
            servicePeriodEnd:
              data.servicePeriodEnd &&
              isCalendarDate(data.servicePeriodEnd) &&
              !issues.includes("SERVICE_PERIOD_INVALID")
                ? new Date(data.servicePeriodEnd + "T00:00:00Z")
                : null,
            extractedLineItems: json(data),
            reconciliationIssues: issues,
            snapshot: {
              audit: {
                model: extracted.model,
                requestedModel: extracted.requestedModel,
              },
            },
          },
        });
        await tx.processingJob.updateMany({
          where: { billId: id, leaseToken: token },
          data: { status: "NEEDS_REVIEW", errorCode: "OCR_READ_FAILED" },
        });
        return saved;
      },
      { maxWait: 2000, timeout: 5000 },
    );

    let ocrIssues = ["OCR_READ_FAILED"];
    // Reserve two bounded persistence transactions and cleanup after OCR.
    if (deadlineAt - Date.now() >= 50000) {
      stage = "ocr_verify";
      try {
        ocrIssues = verifyExtractionAgainstOcr(
          extracted.data,
          await readBillText(evidence, 30000),
        );
      } catch (error) {
        // Persist only exact machine codes, never worker paths or raw messages.
        const code = error instanceof Error ? error.message : null;
        ocrIssues = [
          code === "OCR_TIMEOUT" ||
          code === "OCR_ASSET_MISSING" ||
          code === "OCR_WORKER_START_FAILED" ||
          code === "OCR_READ_FAILED"
            ? code
            : "OCR_READ_FAILED",
        ];
      }
    }
    extracted.data.issues = [...originalIssues, ...ocrIssues];
    if (ocrIssues.length === 0 && /flash/i.test(extracted.model)) {
      extracted.data.notes = [
        ...extracted.data.notes,
        "Extraction used a flash model; printed amounts were checked against OCR.",
      ];
    }
    issues = reconcile(extracted.data);
    stage = "save_ocr_review";
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Bill" WHERE id=${id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "ProcessingJob" WHERE "billId"=${id} FOR UPDATE`;
        const job = await tx.processingJob.findUniqueOrThrow({
          where: { billId: id },
        });
        must(
          job.leaseToken === token &&
            job.leaseUntil &&
            job.leaseUntil > new Date(),
          "PROCESSING_LEASE_EXPIRED",
        );
        await tx.billVersion.update({
          where: { id: version.id },
          data: {
            extractedLineItems: json(extracted.data),
            reconciliationIssues: issues,
          },
        });
        await tx.processingJob.updateMany({
          where: { billId: id, leaseToken: token },
          data: {
            status: "NEEDS_REVIEW",
            errorCode:
              ocrIssues[0] ??
              (issues.includes("PROCESSING_DEADLINE_EXCEEDED")
                ? "PROCESSING_DEADLINE_EXCEEDED"
                : null),
          },
        });
      },
      { maxWait: 2000, timeout: 5000 },
    );
    // Recheck after persistence, before the 30-second calculation transaction.
    if (issues.length === 0 && deadlineAt - Date.now() < 40000) {
      issues.push("PROCESSING_DEADLINE_EXCEEDED");
    }
    if (issues.length === 0) {
      stage = "generate_draft";
      try {
        await generateDraft(id, version.id, token);
      } catch (error) {
        if (error instanceof AppError) issues.push(error.code);
        else throw error;
      }
    }
    stage = "complete_job";
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Bill" WHERE id=${id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "ProcessingJob" WHERE "billId"=${id} FOR UPDATE`;
        const job = await tx.processingJob.findUniqueOrThrow({
          where: { billId: id },
        });
        must(job.leaseToken === token, "PROCESSING_LEASE_EXPIRED");
        if (issues.length) {
          await tx.billVersion.update({
            where: { id: version.id },
            data: { reconciliationIssues: issues },
          });
        }
        await tx.processingJob.updateMany({
          where: { billId: id, leaseToken: token },
          data: {
            status: issues.length ? "NEEDS_REVIEW" : "READY",
            errorCode:
              ocrIssues[0] ??
              (issues.includes("PROCESSING_DEADLINE_EXCEEDED")
                ? "PROCESSING_DEADLINE_EXCEEDED"
                : null),
            leaseToken: null,
            leaseUntil: null,
          },
        });
      },
      { maxWait: 2000, timeout: 5000 },
    );
    return {
      status: issues.length ? "NEEDS_REVIEW" : "READY",
      versionId: version.id,
    };
  } catch (error) {
    // Never emit exception messages, stacks, Prisma metadata or credentials.
    console.error("BILL_PROCESS_FAILED", {
      stage,
      category:
        error instanceof AppError
          ? "application"
          : error instanceof Prisma.PrismaClientKnownRequestError
            ? "database"
            : "unexpected",
      code:
        error instanceof Prisma.PrismaClientKnownRequestError &&
        /^P\d{4}$/.test(error.code)
          ? error.code
          : undefined,
    });
    try {
      await db.processingJob.updateMany({
        where: { billId: id, leaseToken: token },
        data: {
          status: "FAILED",
          leaseUntil: null,
          leaseToken: null,
          errorCode:
            error instanceof AppError ? error.code : "PROCESSING_FAILED",
        },
      });
    } catch {
      console.error("BILL_PROCESS_FAILURE_STATE_NOT_SAVED", { stage });
    }
    throw error;
  }
}
export async function publish(
  id: string,
  landlordId: string,
  versionId: string,
  fingerprint: string,
  key: string,
) {
  await ownedBill(id, landlordId);
  return getDb().$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Bill" WHERE id=${id} FOR UPDATE`;
      const v = await tx.billVersion.findUnique({
        where: { id: versionId },
      });
      must(v && v.billId === id, "NOT_FOUND", 404);
      if (v.status === "PUBLISHED") {
        must(
          v.publicationKey === key && v.inputFingerprint === fingerprint,
          "ALREADY_PUBLISHED",
        );
        return { versionId: v.id, status: v.status };
      }
      must(v.status === "READY", "VERSION_NOT_READY");
      const job = await tx.processingJob.findUnique({ where: { billId: id } });
      must(job?.status === "READY" && !job.leaseUntil, "PROCESSING_NOT_READY");
      const latest = await tx.billVersion.findFirst({
        where: { billId: id },
        orderBy: { versionNumber: "desc" },
      });
      must(latest?.id === v.id, "STALE_VERSION");
      const c = await calculation(tx, id, v.id);
      must(
        c.fingerprint === fingerprint && v.inputFingerprint === fingerprint,
        "STALE_INPUTS",
      );
      const rows = await tx.charge.findMany({ where: { billVersionId: v.id } });
      must(
        rows.length === c.result.charges.length &&
          rows.every((row) =>
            c.result.charges.some(
              (expected) =>
                expected.tenantId === row.tenantId &&
                row.actualShare.equals(expected.actualShare) &&
                row.netAmountDue.equals(expected.netAmountDue),
            ),
          ),
        "DRAFT_CHANGED",
      );
      await tx.billVersion.update({
        where: { id: v.id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          publicationKey: key,
        },
      });
      return { versionId: v.id, status: "PUBLISHED" };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 30000,
    },
  );
}

export async function reviewDates(
  id: string,
  landlordId: string,
  input: {
    versionId: string;
    start: string;
    end: string;
    note: string;
    settlement?: z.infer<typeof settlementSchema>;
  },
) {
  try {
    must(calendarDays(input.start, input.end) > 0, "INVALID_DATES", 400);
  } catch {
    throw new AppError(400, "INVALID_DATES");
  }
  await ownedBill(id, landlordId);
  return getDb().$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Bill" WHERE id=${id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "ProcessingJob" WHERE "billId"=${id} FOR UPDATE`;
      const job = await tx.processingJob.findUnique({ where: { billId: id } });
      must(
        !job?.leaseUntil || job.leaseUntil < new Date(),
        "PROCESSING_IN_PROGRESS",
      );
      const previous = await tx.billVersion.findFirstOrThrow({
        where: { billId: id },
        orderBy: { versionNumber: "desc" },
      });
      must(
        previous.id === input.versionId && previous.status !== "PUBLISHED",
        "STALE_VERSION",
      );
      if (input.settlement) {
        const settlement = settlementSchema.parse(input.settlement);
        const retainedWarnings = z
          .object({
            reconciliation: z.object({ ignoredIssues: z.array(z.string()) }),
          })
          .safeParse(previous.snapshot);
        const previousIssues = [
          ...new Set([
            ...z.array(z.string()).parse(previous.reconciliationIssues),
            ...(retainedWarnings.success
              ? retainedWarnings.data.reconciliation.ignoredIssues
              : []),
          ]),
        ];
        must(
          settlement.acknowledgedIssues.length === previousIssues.length &&
            previousIssues.every((issue) =>
              settlement.acknowledgedIssues.includes(issue),
            ),
          "REVIEW_ISSUES_CHANGED",
        );
      }
      const original = parseExtraction(previous.extractedLineItems);
      const data = parseExtraction({
        ...original,
        servicePeriodStart: input.start,
        servicePeriodEnd: input.end,
        issues: original.issues,
        evidence: [
          ...original.evidence,
          ...["servicePeriodStart", "servicePeriodEnd"].map((field) => ({
            field,
            rawText: field === "servicePeriodStart" ? input.start : input.end,
            page: 1,
            region:
              "Manual correction by " +
              landlordId +
              " on " +
              new Date().toISOString() +
              ": " +
              input.note,
          })),
        ],
      });
      const issues = reconcile(data);
      const version = await tx.billVersion.create({
        data: {
          billId: id,
          versionNumber: previous.versionNumber + 1,
          currency: previous.currency,
          settlementTotal: previous.settlementTotal,
          advancePayments: previous.advancePayments,
          amountDue: previous.amountDue,
          nextPeriodAdvance: previous.nextPeriodAdvance,
          servicePeriodStart: new Date(input.start + "T00:00:00Z"),
          servicePeriodEnd: new Date(input.end + "T00:00:00Z"),
          extractedLineItems: json(data),
          reconciliationIssues: issues,
          snapshot: json({
            audit: {
              previousVersion: previous.id,
              original,
              manual: {
                ...input,
                userId: landlordId,
                at: new Date().toISOString(),
              },
            },
            previousVersion: previous.id,
            original,
            manual: {
              ...input,
              userId: landlordId,
              at: new Date().toISOString(),
            },
          }),
        },
      });
      let errorCode: string | null = null;
      try {
        await writeDraft(tx, id, version.id);
      } catch (error) {
        if (error instanceof AppError) errorCode = error.code;
        else throw error;
      }
      await tx.processingJob.update({
        where: { billId: id },
        data: {
          status: errorCode ? "NEEDS_REVIEW" : "READY",
          errorCode,
          leaseToken: null,
          leaseUntil: null,
        },
      });
      return {
        versionId: version.id,
        status: errorCode ? "NEEDS_REVIEW" : "READY",
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 30000,
    },
  );
}
