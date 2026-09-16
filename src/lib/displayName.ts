/**
 * Returns a human-friendly display name.
 * Falls back to a name derived from the email when the stored name is
 * empty or a placeholder like "User" (e.g. accounts created by the
 * customer app before a real name was captured).
 */
export const displayName = (
  fullName: string | null | undefined,
  email: string | null | undefined
): string => {
  const name = (fullName || "").trim();
  if (name && !/^user$/i.test(name)) return name;

  const prefix = (email || "").split("@")[0].trim();
  if (!prefix) return name || "Customer";

  return prefix
    .split(/[._\-+]+/)
    .map((part) => part.replace(/\d+/g, ""))
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ") || "Customer";
};
