import { createHash } from "node:crypto";

export function planReleaseSync({ sourceReleases, targetReleases, selectedTags, managedAssets }) {
  const targets = new Map(targetReleases.map((release) => [release.tagName, release]));
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
    for (const asset of source.assets || []) {
      const key = `${source.tagName}/${asset.name}`;
      const targetAsset = targetAssets.get(asset.name);
      if (!targetAsset) {
        assets.push({ action: "upload", tagName: source.tagName, asset });
        continue;
      }
      if (targetAsset.size === asset.size) continue;
      const managed = managedAssets[key];
      if (!managed || managed.size !== targetAsset.size) {
        throw new Error(`unmanaged release asset drift at ${key}`);
      }
      assets.push({ action: "replace", tagName: source.tagName, asset, targetAsset });
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
  const targetReleases = await adapter.listReleases(sourceRepository);
  const plan = planReleaseSync({ sourceReleases, targetReleases, selectedTags, managedAssets });
  const releasesByTag = new Map(targetReleases.map((release) => [release.tagName, release]));

  for (const item of plan.releases) {
    if (item.action === "aligned") continue;
    const release = await adapter.createOrUpdateRelease(sourceRepository, item.source, item.target);
    releasesByTag.set(item.tagName, release);
  }

  const nextManagedAssets = { ...managedAssets };
  for (const item of plan.assets) {
    const release = releasesByTag.get(item.tagName);
    if (!release) throw new Error(`target release is missing after metadata sync: ${item.tagName}`);
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
  }

  return { plan, managedAssets: nextManagedAssets };
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
  return ["name", "body", "prerelease"].every((field) => (source[field] ?? "") === (target[field] ?? ""));
}
