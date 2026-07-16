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

export function applyReleaseAssetLimit(releases, selectedTags, limit) {
  if (!Number.isInteger(limit) || limit <= 0) return { releases, omittedAssetCount: 0 };
  let omittedAssetCount = 0;
  const projected = releases.map((release) => {
    if (!selectedTags.has(release.tagName) || release.assets.length <= limit) return release;
    const assets = release.assets
      .map((asset, index) => ({ asset, index, rank: assetPriority(asset.name) }))
      .sort((left, right) => left.rank - right.rank || left.index - right.index)
      .slice(0, limit)
      .sort((left, right) => left.index - right.index)
      .map(({ asset }) => asset);
    omittedAssetCount += release.assets.length - assets.length;
    return { ...release, assets };
  });
  return { releases: projected, omittedAssetCount };
}

function assetPriority(name) {
  const lower = name.toLowerCase();
  if (lower === "checksums.txt" || lower.includes("checksum")) return 0;
  if (/^install\.(sh|ps1)$/.test(lower)) return 1;
  if (/-(darwin|linux|windows)-(amd64|arm64|armv7)\.(tar\.gz|zip)$/.test(lower)) return 2;
  if (!lower.endsWith(".sbom.json") && !/\.(deb|rpm|apk|pkg\.tar\.zst)$/.test(lower)) return 3;
  if (lower.endsWith(".sbom.json")) return 4;
  if (lower.endsWith(".deb")) return 5;
  if (lower.endsWith(".rpm")) return 6;
  if (lower.endsWith(".apk")) return 7;
  return 8;
}

function parseDate(value, label) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`invalid date for ${label}`);
  return timestamp;
}
