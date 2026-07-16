const SEVERITY = ["aligned", "unsupported", "lagging", "drifted", "failed"];

export function auditRepository({ source, target, previous, capabilities }) {
  if (!target) return { status: "failed", dimensions: { repository: detail("failed", "missing target") } };
  const dimensions = {
    defaultBranch: detail(source.defaultBranch === target.defaultBranch ? "aligned" : "drifted"),
    refs: auditRefs(source.refs, target.refs, previous?.refs),
    metadata: capability(capabilities.metadata),
    wiki: capability(capabilities.wiki),
    releases: capability(capabilities.releases),
    releaseAssets: capabilities.releases === "unsupported"
      ? detail("unsupported")
      : auditReleaseAssets(source.releases || [], target.releases || []),
  };
  return {
    status: Object.values(dimensions).map((item) => item.status).sort(bySeverity).at(-1),
    dimensions,
  };
}

function auditRefs(source, target, previous = {}) {
  if (same(source, target)) return detail("aligned");
  for (const [ref, oid] of Object.entries(target || {})) {
    if (previous[ref] !== undefined && previous[ref] !== oid) return detail("drifted", ref);
  }
  return detail("lagging");
}

function auditReleaseAssets(sourceReleases, targetReleases) {
  const targetByTag = new Map(targetReleases.map((release) => [release.tagName, release]));
  for (const release of sourceReleases) {
    const targetAssets = new Map((targetByTag.get(release.tagName)?.assets || []).map((asset) => [asset.name, asset.size]));
    for (const asset of release.assets || []) {
      if (targetAssets.get(asset.name) !== asset.size) return detail("lagging", `${release.tagName}/${asset.name}`);
    }
  }
  return detail("aligned");
}

function capability(value) {
  return detail(value === "unsupported" ? "unsupported" : "aligned");
}

function detail(status, reason) {
  return reason ? { status, reason } : { status };
}

function same(left, right) {
  return JSON.stringify(Object.entries(left || {}).sort()) === JSON.stringify(Object.entries(right || {}).sort());
}

function bySeverity(left, right) {
  return SEVERITY.indexOf(left) - SEVERITY.indexOf(right);
}
