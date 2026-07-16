import { releaseBodiesEquivalent } from "./release-metadata.mjs";

const SEVERITY = ["aligned", "unsupported", "lagging", "drifted", "failed"];

export function auditRepository({ source, target, previous, capabilities, selectedTags = new Set() }) {
  if (!target) return { status: "failed", dimensions: { repository: detail("failed", "missing target") } };
  const dimensions = {
    repository: detail("aligned"),
    defaultBranch: detail(source.defaultBranch === target.defaultBranch ? "aligned" : "drifted"),
    refs: auditRefs(source.refs, target.refs, previous?.refs),
    metadata: capabilities.metadata === "unsupported"
      ? detail("unsupported")
      : auditMetadata(source, target),
    wiki: capability(capabilities.wiki),
    releases: capabilities.releases === "unsupported"
      ? detail("unsupported")
      : auditReleases(source.releases || [], target.releases || []),
    releaseAssets: capabilities.releases === "unsupported"
      ? detail("unsupported")
      : auditReleaseAssets(source.releases || [], target.releases || [], selectedTags),
    releaseAssetPolicy: source.omittedAssetCount > 0
      ? detail("unsupported", `${source.omittedAssetCount} source assets omitted by platform policy`)
      : detail("aligned"),
  };
  return {
    status: Object.values(dimensions).map((item) => item.status).sort(bySeverity).at(-1),
    dimensions,
  };
}

function auditMetadata(source, target) {
  const fields = ["description", "homepage", "archived"];
  for (const field of fields) {
    if (target[field] !== undefined && normalize(source[field]) !== normalize(target[field])) {
      return detail("drifted", field);
    }
  }
  if (target.topics !== undefined && !sameList(source.topics, target.topics)) return detail("drifted", "topics");
  return detail("aligned");
}

function auditRefs(source, target, previous = {}) {
  if (same(source, target)) return detail("aligned");
  for (const [ref, oid] of Object.entries(target || {})) {
    if (previous[ref] !== undefined && previous[ref] !== oid) return detail("drifted", ref);
  }
  return detail("lagging");
}

function auditReleases(sourceReleases, targetReleases) {
  const targetByTag = new Map(targetReleases.map((release) => [release.tagName, release]));
  const sourceTags = new Set(sourceReleases.map((release) => release.tagName));
  for (const release of sourceReleases) {
    const target = targetByTag.get(release.tagName);
    if (!target) return detail("lagging", release.tagName);
    if (!releaseBodiesEquivalent(release, target)) return detail("drifted", release.tagName);
    for (const field of ["name", "prerelease"]) {
      if (normalize(release[field]) !== normalize(target[field])) return detail("drifted", release.tagName);
    }
  }
  for (const release of targetReleases) {
    if (!sourceTags.has(release.tagName)) return detail("drifted", release.tagName);
  }
  return detail("aligned");
}

function auditReleaseAssets(sourceReleases, targetReleases, selectedTags) {
  const targetByTag = new Map(targetReleases.map((release) => [release.tagName, release]));
  for (const release of sourceReleases) {
    if (!selectedTags.has(release.tagName)) continue;
    const targetAssets = new Map((targetByTag.get(release.tagName)?.assets || []).map((asset) => [asset.name, asset.size]));
    const sourceAssetNames = new Set((release.assets || []).map((asset) => asset.name));
    for (const asset of release.assets || []) {
      if (targetAssets.get(asset.name) !== asset.size) return detail("lagging", `${release.tagName}/${asset.name}`);
    }
    for (const asset of targetByTag.get(release.tagName)?.assets || []) {
      if (!sourceAssetNames.has(asset.name)) return detail("drifted", `${release.tagName}/${asset.name}`);
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

function sameList(left = [], right = []) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function normalize(value) {
  if (value === null || value === undefined) return "";
  return value;
}

function bySeverity(left, right) {
  return SEVERITY.indexOf(left) - SEVERITY.indexOf(right);
}
