import { calendarDays } from "../utils/date";
import { MoneyDecimal } from "../utils/decimal";

// Full-message allowlist: a success clause must never hide an unresolved suffix.
// Verify the claimed operation too; unfamiliar or incorrect claims stay blocking.
function isCompletedCheck(text: string): boolean {
  const conversion =
    /^Service period end (\d{4}-\d{2}-\d{2}) is inclusive; converted to exclusive (\d{4}-\d{2}-\d{2})\.?$/i.exec(
      text.trim(),
    );
  if (conversion) {
    try {
      return calendarDays(conversion[1], conversion[2]) === 1;
    } catch {
      return false;
    }
  }
  const consistency =
    /^Net (-?\d{1,12}(?:\.\d{1,2})?) plus tax (-?\d{1,12}(?:\.\d{1,2})?) equals (-?\d{1,12}(?:\.\d{1,2})?), consistent with gross amount\.?$/i.exec(
      text.trim(),
    );
  return (
    consistency !== null &&
    new MoneyDecimal(consistency[1]).plus(consistency[2]).equals(consistency[3])
  );
}

export function splitReviewRemarks(
  issues: readonly string[],
  notes: readonly string[] = [],
): { issues: string[]; notes: string[] } {
  const blocking: string[] = [];
  const information = [...notes];
  for (const issue of issues) {
    if (isCompletedCheck(issue)) information.push(issue);
    else blocking.push(issue);
  }
  return { issues: [...new Set(blocking)], notes: [...new Set(information)] };
}
