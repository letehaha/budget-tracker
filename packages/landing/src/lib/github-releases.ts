// ponytail: fetched at build time, so the list is as fresh as the last deploy.
interface Release {
  version: string;
  title: string;
  publishedOn: string;
}

/** Newest first. Empty when GitHub is unreachable, so the section falls back to static copy. */
export async function getRecentReleases({ limit }: { limit: number }): Promise<Release[]> {
  try {
    const res = await fetch(`https://api.github.com/repos/letehaha/budget-tracker/releases?per_page=${limit}`, {
      headers: process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {},
    });
    if (!res.ok) return [];
    const releases = (await res.json()) as { name?: string; tag_name: string; published_at?: string }[];
    const dateFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });

    return releases
      .filter((release) => release.published_at)
      .map((release) => ({
        version: release.tag_name,
        // Release names are "v1.2.3 – What changed"; the version is shown separately.
        title: (release.name ?? '').replace(release.tag_name, '').replace(/^[\s–—-]+/, ''),
        publishedOn: dateFormat.format(new Date(release.published_at!)),
      }));
  } catch {
    return [];
  }
}
