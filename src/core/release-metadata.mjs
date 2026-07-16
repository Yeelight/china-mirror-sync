export function portableReleaseBody(release) {
  if (release.body) return release.body;
  return release.canonicalUrl
    ? `Canonical release: ${release.canonicalUrl}`
    : "Canonical release metadata is maintained on GitHub.";
}

export function releaseBodiesEquivalent(source, target) {
  const sourceBody = source.body || "";
  const targetBody = target.body || "";
  return sourceBody === targetBody || (!sourceBody && targetBody === portableReleaseBody(source));
}
