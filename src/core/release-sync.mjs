import { createHash } from "node:crypto";

import { releaseBodiesEquivalent } from "./release-metadata.mjs";
import { applyReleaseAssetLimit } from "./release-policy.mjs";

export function planReleaseSync({ sourceReleases, targetReleases, selectedTags, managedAssets }) {
  const targets = new Map(targetReleases.map((release) => [release.tagName, release]));
  const sourceTags = new Set(sourceReleases.map((release) => release.tagName));
  const releases = [];
  const assets = [];

  for (const source of sourceReleases) {
    const target = targets.get(source.tagName);
    releases.push({
      action: target ? (metadataEqual(source, target) ? "aligned" : "update") : "create",
      tagName: source.tagName,
      source,
      target: target || null,
    });
    if (!selectedTags.has(source.tagName)) continue;

    const targetAssets = new Map((target?.assets || []).map((asset) => [asset.name, asset]));
    const sourceAssetNames = new Set((source.assets || []).map((asset) => asset.name));
    for (const asset of source.assets || []) {
      const key = `${source.tagName}/${asset.name}`;
      const targetAsset = targetAssets.get(asset.name);
      if (!targetAsset) {
        assets.push({ action: "upload", tagName: source.tagName, asset });
        continue;
      }
      if (targetAsset.size === asset.size) continue;
      assets.push({ action: "replace", tagName: source.tagName, asset, targetAsset });
    }
    for (const targetAsset of target?.assets || []) {
      if (!sourceAssetNames.has(targetAsset.name)) {
        assets.push({ action: "delete", tagName: source.tagName, targetAsset });
      }
    }
  }
  for (const target of targetReleases) {
    if (!sourceTags.has(target.tagName)) {
      releases.push({ action: "delete", tagName: target.tagName, source: null, target });
    }
  }

  return { releases, assets };
}

export async function executeReleaseSync({
  sourceRepository,
  sourceReleases,
  selectedTags,
  managedAssets,
  adapter,
  githubToken,
  fetchImpl = fetch,
  maxAssetBytes = 500 * 1024 * 1024,
}) {
  const projection = applyReleaseAssetLimit(
    sourceReleases,
    selectedTags,
    adapter.releaseAssetLimit,
    adapter.releaseAssetExclusions,
  );
  const listedReleases = await adapter.listReleases(sourceRepository);
  const targetReleases = await Promise.all(listedReleases.map(async (release) => ({
    ...release,
    assets: await adapter.listReleaseAssets(sourceRepository, release),
  })));
  const plan = planReleaseSync({
    sourceReleases: projection.releases,
    targetReleases,
    selectedTags,
    managedAssets,
  });
  const releasesByTag = new Map(targetReleases.map((release) => [release.tagName, release]));

  for (const item of plan.releases) {
    if (item.action === "aligned") continue;
    if (item.action === "delete") {
      await adapter.deleteRelease(sourceRepository, item.target);
      releasesByTag.delete(item.tagName);
      continue;
    }
    const release = await adapter.createOrUpdateRelease(sourceRepository, item.source, item.target);
    releasesByTag.set(item.tagName, release);
  }

  const nextManagedAssets = { ...managedAssets };
  const assetConcurrency = adapter.releaseAssetConcurrency || 4;
  const processAsset = async (item) => {
    const release = releasesByTag.get(item.tagName);
    if (!release) throw new Error(`target release is missing after metadata sync: ${item.tagName}`);
    if (item.action === "delete") {
      await adapter.deleteManagedReleaseAsset(sourceRepository, release, item.targetAsset);
      delete nextManagedAssets[`${item.tagName}/${item.targetAsset.name}`];
      return;
    }
    const verified = await downloadVerifiedAsset(item.asset, { githubToken, fetchImpl, maxAssetBytes });
    if (item.action === "replace") {
      await adapter.deleteManagedReleaseAsset(sourceRepository, release, item.targetAsset);
    }
    await adapter.uploadReleaseAsset(sourceRepository, release, verified);
    nextManagedAssets[`${item.tagName}/${item.asset.name}`] = {
      size: verified.size,
      sha256: verified.sha256,
      synchronizedAt: new Date().toISOString(),
    };
  };
  await forEachConcurrent(plan.assets.filter((item) => item.action === "delete"), assetConcurrency, processAsset);
  await forEachConcurrent(plan.assets.filter((item) => item.action !== "delete"), assetConcurrency, processAsset);
  for (const item of plan.releases) {
    if (item.action !== "delete") continue;
    for (const key of Object.keys(nextManagedAssets)) {
      if (key.startsWith(`${item.tagName}/`)) delete nextManagedAssets[key];
    }
  }

  return { plan, managedAssets: nextManagedAssets, omittedAssetCount: projection.omittedAssetCount };
}

async function forEachConcurrent(items, limit, worker) {
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

async function downloadVerifiedAsset(asset, { githubToken, fetchImpl, maxAssetBytes }) {
  if (!Number.isInteger(asset.size) || asset.size < 0 || asset.size > maxAssetBytes) {
    throw new Error(`release asset size is outside policy: ${asset.name}`);
  }
  const headers = { accept: "application/octet-stream" };
  if (githubToken) headers.authorization = `Bearer ${githubToken}`;
  const response = await fetchImpl(asset.downloadUrl, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  if (!response.ok) throw new Error(`release asset download failed with HTTP ${response.status}: ${asset.name}`);
  const blob = await response.blob();
  if (blob.size !== asset.size) throw new Error(`release asset size mismatch: ${asset.name}`);
  const sha256 = createHash("sha256").update(Buffer.from(await blob.arrayBuffer())).digest("hex");
  if (asset.digest?.startsWith("sha256:") && asset.digest.slice("sha256:".length) !== sha256) {
    throw new Error(`release asset digest mismatch: ${asset.name}`);
  }
  return { ...asset, blob, sha256 };
}

function metadataEqual(source, target) {
  return releaseBodiesEquivalent(source, target)
    && ["name", "prerelease"].every((field) => (source[field] ?? "") === (target[field] ?? ""));
}
