import { isValid } from "date-fns";
export class InvalidPeriodError extends Error {
  constructor(message = "Expected a valid non-empty [start, end) interval") {
    super(message);
    this.name = "InvalidPeriodError";
  }
}
export function isCalendarDate(value: string): boolean {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    isValid(date) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
function ordinal(value: string): number {
  if (!isCalendarDate(value))
    throw new InvalidPeriodError(`Invalid calendar date: ${value}`);
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}
export function validatePeriod(start: string, end: string): void {
  if (ordinal(end) <= ordinal(start)) throw new InvalidPeriodError();
}
export function calendarDays(start: string, end: string): number {
  validatePeriod(start, end);
  return ordinal(end) - ordinal(start);
}
/** Intersect date-only intervals; a null tenancy end is open-ended. */
export function intersectPeriods(
  start: string,
  end: string,
  occupancyStart: string,
  occupancyEnd: string | null,
): number {
  validatePeriod(start, end);
  if (!isCalendarDate(occupancyStart)) throw new InvalidPeriodError();
  if (occupancyEnd !== null) validatePeriod(occupancyStart, occupancyEnd);
  return Math.max(
    0,
    Math.min(
      ordinal(end),
      occupancyEnd === null ? ordinal(end) : ordinal(occupancyEnd),
    ) - Math.max(ordinal(start), ordinal(occupancyStart)),
  );
}
/** Union of occupied dates, not the sum of all residents' days. */
export function coveredDays(
  start: string,
  end: string,
  intervals: Array<{ start: string; end: string | null }>,
): number {
  validatePeriod(start, end);
  const ranges = intervals
    .map((i) => {
      if (!isCalendarDate(i.start)) throw new InvalidPeriodError();
      if (i.end !== null) validatePeriod(i.start, i.end);
      return [
        Math.max(ordinal(start), ordinal(i.start)),
        Math.min(ordinal(end), i.end === null ? ordinal(end) : ordinal(i.end)),
      ];
    })
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  let days = 0;
  let cursor = ordinal(start);
  for (const [a, b] of ranges) {
    days += Math.max(0, b - Math.max(a, cursor));
    cursor = Math.max(cursor, b);
  }
  return days;
}
