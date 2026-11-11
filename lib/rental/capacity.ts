export interface Occupancy {
  start: string;
  end: string | null;
}
export function overlaps(a: Occupancy, b: Occupancy) {
  return (!a.end || b.start < a.end) && (!b.end || a.start < b.end);
}
/** Sweep clipped intervals; separate bookings may intersect a request without coexisting. */
export function hasCapacity(
  existing: Occupancy[],
  requested: Occupancy,
  capacity: number,
) {
  const events: { day: string; delta: number }[] = [
    { day: requested.start, delta: 1 },
  ];
  if (requested.end) events.push({ day: requested.end, delta: -1 });
  for (const stay of existing) {
    if (!overlaps(stay, requested)) continue;
    const start = stay.start > requested.start ? stay.start : requested.start;
    const end = !stay.end
      ? requested.end
      : !requested.end
        ? stay.end
        : stay.end < requested.end
          ? stay.end
          : requested.end;
    events.push({ day: start, delta: 1 });
    if (end) events.push({ day: end, delta: -1 });
  }
  events.sort((a, b) => a.day.localeCompare(b.day) || a.delta - b.delta);
  let occupied = 0;
  for (const e of events) {
    occupied += e.delta;
    if (occupied > capacity) return false;
  }
  return true;
}
