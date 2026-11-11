export function statusLabel(status: string | undefined, en: boolean) {
  const labels: Record<string, [string, string]> = {
    QUEUED: ["等待处理", "Queued"],
    PROCESSING: ["正在处理", "Processing"],
    NEEDS_REVIEW: ["需要核对", "Needs review"],
    READY: ["可以发布", "Ready to publish"],
    FAILED: ["处理未完成", "Processing incomplete"],
    DRAFT: ["草稿", "Draft"],
    PUBLISHED: ["已发布", "Published"],
    SUPERSEDED: ["已有新版本", "Superseded"],
  };
  return status
    ? (labels[status]?.[en ? 1 : 0] ?? status)
    : en
      ? "Waiting for a result"
      : "等待结果";
}
