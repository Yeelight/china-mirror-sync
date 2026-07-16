export function selectReleaseAssets(releases, { assetSyncFrom }) {
  const cutoff = parseDate(assetSyncFrom, "assetSyncFrom");
  const published = releases.filter((release) => !release.draft && release.publishedAt);
  const selected = new Set();

  const stable = published
    .filter((release) => !release.prerelease)
    .sort((left, right) => parseDate(right.publishedAt, right.tagName) - parseDate(left.publishedAt, left.tagName))[0];
  if (stable) selected.add(stable.tagName);

  for (const release of published) {
    if (parseDate(release.publishedAt, release.tagName) >= cutoff) selected.add(release.tagName);
  }
  return selected;
}

function parseDate(value, label) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`invalid date for ${label}`);
  return timestamp;
}
