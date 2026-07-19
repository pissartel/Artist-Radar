// Compares YYYY-MM-DD date-only strings (never full Date/timezone math) so an
// event dated "today" in the source's own local date is never misclassified
// as past/future due to timezone offsets.
export function toDateOnlyString(value: Date | string): string | null {
  if (typeof value === "string") {
    const isoPrefix = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoPrefix) return isoPrefix[1];
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}
