const issueLabels: Record<string, readonly [string, string]> = {
  AI_OUTPUT_INVALID: [
    "识别服务返回的账单数据格式无效，本次未保存新的提取结果。请重试处理。",
    "The extraction service returned invalid bill data. No new extraction was saved. Retry processing.",
  ],
  AI_PROVIDER_TIMEOUT: [
    "识别服务超时，请重试处理。",
    "The extraction service timed out. Retry processing.",
  ],
  AI_PROVIDER_FAILED: [
    "识别服务暂不可用，请重试处理。",
    "The extraction service is unavailable. Retry processing.",
  ],
  AI_REFUSED_OR_EMPTY: [
    "识别服务未返回账单数据，请核对凭证后重试。",
    "The extraction service returned no bill data. Check the document and retry.",
  ],
  PROCESSING_FAILED: [
    "处理未完成，已保存的提取结果会保留。请重试处理。",
    "Processing failed. Any saved extraction is retained. Retry processing.",
  ],
  PROCESSING_DEADLINE_EXCEEDED: [
    "本次处理时间不足。若已保存草稿，可保存草稿以生成费用；否则请重试处理。",
    "Processing ran out of time. If an extraction is saved, use Save draft to generate charges; otherwise retry processing.",
  ],
  OCR_TIMEOUT: [
    "提取结果已保存，但原件金额核对超时。请重试处理，完成核对前不能发布。",
    "Extraction saved, but the document amount check timed out. Retry processing; publication remains blocked until verification succeeds.",
  ],
  OCR_ASSET_MISSING: [
    "提取结果已保存，但原件核对所需的识别资源缺失。请联系管理员，完成核对前不能发布。",
    "Extraction saved, but a required document recognition asset is missing. Contact the administrator; publication remains blocked until verification succeeds.",
  ],
  OCR_WORKER_START_FAILED: [
    "提取结果已保存，但原件核对服务未能启动。请重试处理，完成核对前不能发布。",
    "Extraction saved, but the document verification worker could not start. Retry processing; publication remains blocked until verification succeeds.",
  ],
  OCR_READ_FAILED: [
    "提取结果已保存，但未能完成原件金额核对。请重试处理，完成核对前不能发布。",
    "Extraction saved, but the document amount check could not finish. Retry processing; publication remains blocked until verification succeeds.",
  ],
  OCR_INCONCLUSIVE: [
    "原件文字不够清晰，无法核对金额。请核对凭证并重试处理。",
    "Too little document text was readable to verify amounts. Check the document and retry processing.",
  ],
  OCR_AMOUNT_MISMATCH: [
    "提取金额与原件文字不一致，不能自动发布。请核对凭证并重试处理。",
    "An extracted amount does not match the document text. Automatic publication is blocked. Check the document and retry processing.",
  ],
  EUR_REQUIRED: ["账单币种须为欧元。", "The statement must be in EUR."],
  CURRENCY_MISSING: [
    "账单未标明币种，请核对凭证后重试。",
    "The statement does not state its currency. Check the document and retry.",
  ],
  SERVICE_PERIOD_MISSING: [
    "缺少完整服务账期，请补充开始日与结束日。",
    "The service period is incomplete. Supply its start and end dates.",
  ],
  SERVICE_PERIOD_INVALID: [
    "服务账期无效，请核对日期，结束日须晚于开始日。",
    "Check the service dates. The end date must be after the start date.",
  ],
  SETTLEMENT_FIELDS_MISSING: [
    "结算总额、供应商预付款或补缴余额缺失，请核对凭证。",
    "The statement total, supplier advances or balance due is missing. Review the document.",
  ],
  SETTLEMENT_MISMATCH: [
    "结算总额减去供应商预付款与补缴余额不一致，请核对金额。",
    "The statement total minus supplier advances does not match the balance due. Review the amounts.",
  ],
  TAX_LINE_MISMATCH: [
    "明细中的税前金额加税额与含税金额不一致，请核对该项。",
    "A line item's net amount plus tax does not match its gross amount. Review this item.",
  ],
  LINE_ITEMS_MISSING: [
    "缺少费用明细，请核对凭证。",
    "Charge details are missing. Review the document.",
  ],
  LINE_ITEMS_TOTAL_MISMATCH: [
    "费用明细合计与结算总额不一致，请核对。",
    "The charge details do not add up to the statement total. Review the amounts.",
  ],
  REFUND_UNSUPPORTED: [
    "此凭证为退款结算，当前收费流程不支持，请另行处理。",
    "This is a refund statement, which the current charging process does not support.",
  ],
  EVIDENCE_MISSING: [
    "关键账单字段缺少原文依据，请核对凭证。",
    "A required statement field has no source reference. Review the document.",
  ],
  VERSION_MISMATCH: [
    "账单与所选版本不匹配，请重新读取账单。",
    "The selected version does not match this bill. Reload the bill.",
  ],
  SCOPE_UNSUPPORTED: [
    "当前仅支持整套房屋的电费分摊，请核对费用类别与范围。",
    "Only whole-property electricity allocation is supported. Check the utility type and scope.",
  ],
  CURRENCY_MISMATCH: [
    "房屋与账单的币种不一致，请核对。",
    "The property and statement currencies do not match. Review them.",
  ],
  RECONCILIATION_REQUIRED: [
    "账单仍有待核对事项，完成复核后才能生成费用。",
    "Resolve the outstanding statement issues before generating charges.",
  ],
  POLICY_MISSING_OR_OVERLAPPING: [
    "服务账期内缺少唯一适用的费用规则，或规则存在重叠，请核对约定。",
    "The service period has no single applicable utility policy, or policies overlap. Review the terms.",
  ],
  POLICY_SCOPE_UNSUPPORTED: [
    "费用规则未完整覆盖本次账期或房屋范围，请核对约定。",
    "The utility policy does not cover this entire service period or property scope. Review the terms.",
  ],
  POLICY_UNSUPPORTED: [
    "当前分摊流程不支持此费用规则，请核对已确认的约定。",
    "The current allocation process does not support these utility terms. Review the confirmed policy.",
  ],
  ALLOCATION_BASE_MISSING: [
    "缺少有效的正数分摊金额，请核对结算依据。",
    "A positive allocation amount is required. Review the settlement basis.",
  ],
  PREPAYMENT_UNSUPPORTED: [
    "此账单的预付款或抵扣安排暂不支持自动分摊，请核对记录。",
    "This bill's advance-payment or credit arrangement is not supported for automatic allocation. Review the records.",
  ],
  MULTIPLE_INTERVALS_UNSUPPORTED: [
    "账期内没有适用入住记录，或同一租客有多段入住记录；请核对入住安排。",
    "There are no applicable stays, or a tenant has multiple stay intervals in this period. Review occupancy records.",
  ],
  TENANCY_APPLICATION_MISMATCH: [
    "入住记录与已批准的申请不一致，请核对租客、房屋与房间。",
    "An occupancy record does not match its approved application. Check the tenant, property and room.",
  ],
  RULE_CONFIRMATION_MISSING: [
    "房东或租客尚未确认本次适用的费用规则，请先完成双方确认。",
    "The landlord or tenant has not confirmed the applicable utility terms. Both confirmations are required.",
  ],
  ALLOCATION_MISMATCH: [
    "个人费用与房东承担额的合计不等于分摊总额，暂不能生成费用。",
    "Tenant charges and the landlord share do not add up to the allocation total. Charges cannot be generated.",
  ],
};

const evidenceFieldLabels: Record<string, readonly [string, string]> = {
  settlementTotal: ["结算总额", "Statement total"],
  advancePayments: ["供应商预付款", "Supplier advance payments"],
  amountDue: ["供应商补缴余额", "Supplier balance due"],
  servicePeriodStart: ["服务开始日", "Service start date"],
  servicePeriodEnd: ["服务结束日", "Service end date"],
};

/** Translate machine issues without rewriting source/model free-text warnings. */
export function billingIssueLabel(issue: string, en: boolean): string {
  const machineIssue = /^([A-Z][A-Z0-9_]*)(?::\s*([\s\S]*))?$/.exec(
    issue.trim(),
  );
  if (!machineIssue) return issue;
  const [, code, detail] = machineIssue;
  const label = issueLabels[code]?.[en ? 1 : 0];
  if (!label)
    return en ? "This bill needs further review." : "账单需要进一步核对。";
  if (code === "TAX_LINE_MISMATCH" && detail)
    return `${label} ${en ? "Item: " : "明细："}${detail}`;
  if (code === "EVIDENCE_MISSING" && detail) {
    const field = evidenceFieldLabels[detail]?.[en ? 1 : 0];
    if (field)
      return en
        ? `${field} has no source reference. Review the document.`
        : `${field}缺少原文依据，请核对凭证。`;
  }
  return label;
}
