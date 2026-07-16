import { HttpError, requestJson } from "../core/http.mjs";
import { portableReleaseBody } from "../core/release-metadata.mjs";

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

export function createGiteeLikeAdapter(config, options = {}) {
  const { token, fetchImpl = fetch, authHeader, authPrefix, releaseNormalizer = normalizeRelease } = options;
  const context = { config, token, fetchImpl, authHeader, authPrefix, releaseNormalizer };
  validateConfig(config);

  return {
    id: config.id,
    releaseAssetConcurrency: config.adapter === "gitee" ? 1 : 4,
    capabilities: () => ({
      metadata: "supported",
      wiki: "unsupported",
      releases: "supported",
      releaseAssets: "supported",
      releaseAssetDigest: "unsupported",
    }),
    getRepository: (source) => getRepository(context, source),
    createRepository: (source) => createRepository(context, source),
    updateRepositoryMetadata: (source, target) => updateRepositoryMetadata(context, source, target),
    gitRemote: (source) => `${trim(config.webBaseUrl)}/${config.namespace}/${safeName(source.name)}.git`,
    getWikiRemote: (source) => source.hasWiki
      ? `${trim(config.webBaseUrl)}/${config.namespace}/${safeName(source.name)}.wiki.git`
      : null,
    listReleases: (source) => listReleases(context, source),
    createOrUpdateRelease: (source, release, targetRelease) => upsertRelease(context, source, release, targetRelease),
    deleteRelease: (source, release) => deleteRelease(context, source, release),
    listReleaseAssets: (source, release) => listReleaseAssets(context, source, release),
    uploadReleaseAsset: (source, release, asset) => uploadReleaseAsset(context, source, release, asset),
    deleteManagedReleaseAsset: (source, release, asset) => deleteReleaseAsset(context, source, release, asset),
    audit: async (sourceSnapshot, targetSnapshot) => ({ sourceSnapshot, targetSnapshot }),
  };
}

async function getRepository(context, source) {
  try {
    const item = await api(context, `/repos/${context.config.namespace}/${safeName(source.name)}`);
    return normalizeRepository(item);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

async function createRepository(context, source) {
  const item = await api(context, `/orgs/${context.config.namespace}/repos`, {
    method: "POST",
    body: JSON.stringify({
      name: safeName(source.name),
      description: source.description || "",
      homepage: source.homepage || "",
      private: false,
      has_issues: false,
      has_wiki: Boolean(source.hasWiki),
      auto_init: false,
    }),
  });
  return normalizeRepository(item);
}

async function updateRepositoryMetadata(context, source) {
  const item = await api(context, `/repos/${context.config.namespace}/${safeName(source.name)}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: safeName(source.name),
      description: source.description || "",
      homepage: source.homepage || "",
      has_issues: false,
      has_wiki: Boolean(source.hasWiki),
      default_branch: source.defaultBranch,
    }),
  });
  return normalizeRepository(item);
}

async function listReleases(context, source) {
  const items = await api(context, `/repos/${context.config.namespace}/${safeName(source.name)}/releases?per_page=100`);
  return (items || []).map(context.releaseNormalizer);
}

async function upsertRelease(context, source, release, targetRelease) {
  const path = targetRelease?.id
    ? `/repos/${context.config.namespace}/${safeName(source.name)}/releases/${targetRelease.id}`
    : `/repos/${context.config.namespace}/${safeName(source.name)}/releases`;
  const item = await api(context, path, {
    method: targetRelease?.id ? "PATCH" : "POST",
    body: JSON.stringify({
      tag_name: release.tagName,
      name: release.name || release.tagName,
      body: portableReleaseBody(release),
      prerelease: Boolean(release.prerelease),
      target_commitish: release.targetCommitish,
    }),
  });
  return context.releaseNormalizer(item);
}

async function listReleaseAssets(context, source, release) {
  return api(context, `/repos/${context.config.namespace}/${safeName(source.name)}/releases/${release.id}/attach_files`);
}

async function deleteRelease(context, source, release) {
  return api(context, `/repos/${context.config.namespace}/${safeName(source.name)}/releases/${release.id}`, {
    method: "DELETE",
  });
}

async function uploadReleaseAsset(context, source, release, asset) {
  const body = new FormData();
  body.set("file", asset.blob, asset.name);
  return api(context, `/repos/${context.config.namespace}/${safeName(source.name)}/releases/${release.id}/attach_files`, {
    method: "POST",
    body,
    json: false,
    retries: 0,
    timeoutMs: 10 * 60 * 1000,
  });
}

async function deleteReleaseAsset(context, source, release, asset) {
  return api(context, `/repos/${context.config.namespace}/${safeName(source.name)}/releases/${release.id}/attach_files/${asset.id}`, {
    method: "DELETE",
  });
}

function api(context, path, options = {}) {
  const headers = { accept: "application/json" };
  if (context.token) headers[context.authHeader] = `${context.authPrefix}${context.token}`;
  if (options.json !== false && options.body) headers["content-type"] = "application/json";
  return requestJson(`${trim(context.config.apiBaseUrl)}${path}`, {
    fetchImpl: context.fetchImpl,
    secrets: [context.token],
    ...options,
    headers: { ...headers, ...options.headers },
  });
}

function normalizeRepository(item) {
  return {
    id: item.id,
    name: item.name,
    fullName: item.full_name,
    defaultBranch: item.default_branch,
    htmlUrl: item.html_url,
    archived: Boolean(item.archived),
    description: item.description || "",
    homepage: item.homepage || "",
  };
}

function normalizeRelease(item) {
  return {
    id: item.id,
    tagName: item.tag_name,
    name: item.name || item.tag_name,
    body: item.body || "",
    prerelease: Boolean(item.prerelease),
    publishedAt: item.created_at || item.published_at,
    assets: item.attach_files || item.assets || [],
  };
}

function safeName(value) {
  if (typeof value !== "string" || !SAFE_NAME.test(value) || value === "." || value === "..") {
    throw new Error(`unsafe repository name: ${String(value)}`);
  }
  return value;
}

function validateConfig(config) {
  safeName(config.namespace);
  if (!config.apiBaseUrl || !config.webBaseUrl) throw new Error(`invalid ${config.id} platform URLs`);
}

function trim(value) {
  return value.replace(/\/+$/, "");
}
