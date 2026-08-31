function parseIso(iso: string): Date {
  if (!iso) return new Date();
  const normalized = iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? new Date(iso) : d;
}

export function relTime(iso: string): string {
  if (!iso) return "—";
  const date = parseIso(iso);
  const diff = Math.max(0, Date.now() - date.getTime());
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function clockTime(iso: string): string {
  if (!iso) return "—";
  return parseIso(iso).toISOString().slice(11, 19);
}

export function fullTime(iso: string): string {
  if (!iso) return "—";
  return parseIso(iso).toISOString().replace("T", " ").slice(0, 19) + "Z";
}

