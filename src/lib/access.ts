// Who may use the site. Set ALLOWED_EMAIL_DOMAINS (comma-separated, e.g. "totersapp.com") to make the site
// private: only accounts with a verified address at one of those domains can sign in, and guests are turned away.
// Leave it empty for an open site.
export function allowedDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS || '').split(',').map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
}
export const isRestricted = () => allowedDomains().length > 0;

/** True if the address belongs exactly to an allowed domain (sub-domains and look-alikes do not count). */
export function emailAllowed(email: string): boolean {
  const domains = allowedDomains();
  if (!domains.length) return true;
  const at = email.lastIndexOf('@');
  return at > 0 && domains.includes(email.slice(at + 1).toLowerCase());
}
export const domainList = () => allowedDomains().map((d) => '@' + d).join(' or ');
