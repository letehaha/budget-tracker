// Render guard for user-supplied links: only the API validates the scheme, and
// restored backups bypass it, so a `javascript:` value must never reach an href.
export const isHttpUrl = (value: string) => {
  try {
    return /^https?:$/i.test(new URL(value).protocol);
  } catch {
    return false;
  }
};
