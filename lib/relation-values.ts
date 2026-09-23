// PostgREST to-many relations are arrays; nullable/missing collections are empty.
export function arrayOrEmpty<T>(value: readonly (T | null | undefined)[] | null | undefined): T[] {
  return Array.isArray(value) ? value.filter((item): item is T => item != null) : [];
}
// Normalize a nullable to-one relation at the server data boundary.
export function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export function relationMany<T extends object>(value: T | (T | null)[] | null | undefined): T[] {
  if (Array.isArray(value)) return value.filter((item): item is T => item != null && typeof item === "object");
  return value != null && typeof value === "object" ? [value] : [];
}
