const cities: Record<string, string> = {
  berlin: "Berlin",
  柏林: "Berlin",
  hamburg: "Hamburg",
  汉堡: "Hamburg",
  munich: "Munich",
  münchen: "Munich",
  慕尼黑: "Munich",
  cologne: "Cologne",
  köln: "Cologne",
  科隆: "Cologne",
  frankfurt: "Frankfurt",
  法兰克福: "Frankfurt",
};
export function canonicalCity(city: string) {
  return cities[city.trim().toLowerCase()] ?? city.trim();
}
export function cityAliases(city: string) {
  const canonical = canonicalCity(city);
  return [
    ...new Set([
      canonical,
      ...Object.keys(cities).filter((k) => cities[k] === canonical),
    ]),
  ];
}
export function cityInQuery(query: string): string | undefined {
  const lower = query.toLowerCase();
  for (const alias in cities) {
    if (lower.includes(alias)) return cities[alias];
  }
  return undefined;
}
