export function folderRole(specialUse: string | null, path: string) {
  const role = specialUse?.replace(/^\\/, "").toLowerCase();
  const normalized = path.toLowerCase();
  if (role === "inbox" || normalized === "inbox") return "inbox";
  if (role === "sent" || /(^|[/.])(sent|sent items)([/.]|$)/.test(normalized)) return "sent";
  if (role === "drafts" || role === "draft" || /(^|[/.])drafts?([/.]|$)/.test(normalized)) return "drafts";
  if (role === "archive" || /(^|[/.])(archive|all mail)([/.]|$)/.test(normalized)) return "archive";
  if (role === "trash" || /(^|[/.])(trash|deleted|bin)([/.]|$)/.test(normalized)) return "trash";
  if (role === "junk" || role === "spam" || /(^|[/.])(junk|spam)([/.]|$)/.test(normalized)) return "spam";
  return "all";
}

export function senderColor(seed: string) {
  const colors = ["peach", "lavender", "sage", "violet", "blue", "gold"];
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length];
}

export function initials(name: string) {
  return name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

export function previewText(value: string, max = 130) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
}
