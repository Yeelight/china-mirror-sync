import { HttpError, requestJson } from "../core/http.mjs";

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

export function createGitLabComAdapter(config, { token, fetchImpl = fetch } = {}) {
  validateConfig(config);
  const context = { config, token, fetchImpl };
  return {
    id: config.id,
    releaseAssetConcurrency: 4,
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
    listReleaseAssets: async (_source, release) => release.assets || [],
    uploadReleaseAsset: (source, release, asset) => uploadReleaseAsset(context, source, release, asset),
    deleteManagedReleaseAsset: (source, release, asset) => deleteReleaseAsset(context, source, release, asset),
    audit: async (sourceSnapshot, targetSnapshot) => ({ sourceSnapshot, targetSnapshot }),
  };
}

async function getRepository(context, source) {
  try {
    const item = await api(context, `/projects/${projectPath(context.config, source.name)}`);
    return normalizeRepository(item);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

async function createRepository(context, source) {
  const item = await api(context, "/projects", {
    method: "POST",
    body: JSON.stringify({
      name: safeName(source.name),
      path: safeName(source.name),
      namespace_id: context.config.namespaceId,
      visibility: "public",
      initialize_with_readme: false,
      description: source.description || "",
      issues_access_level: "disabled",
      wiki_access_level: source.hasWiki ? "enabled" : "disabled",
    }),
  });
  return normalizeRepository(item);
}

async function updateRepositoryMetadata(context, source, target) {
  const item = await api(context, `/projects/${target.id}`, {
    method: "PUT",
    body: JSON.stringify({
      description: source.description || "",
      default_branch: source.defaultBranch,
      visibility: "public",
      issues_access_level: "disabled",
      wiki_access_level: source.hasWiki ? "enabled" : "disabled",
    }),
  });
  return normalizeRepository(item);
}

async function listReleases(context, source) {
  const items = await api(context, `/projects/${projectPath(context.config, source.name)}/releases?per_page=100`);
  return (items || []).map(normalizeRelease);
}

async function upsertRelease(context, source, release, targetRelease) {
  const encodedTag = encodeURIComponent(release.tagName);
  const path = targetRelease
    ? `/projects/${projectPath(context.config, source.name)}/releases/${encodedTag}`
    : `/projects/${projectPath(context.config, source.name)}/releases`;
  const item = await api(context, path, {
    method: targetRelease ? "PUT" : "POST",
    body: JSON.stringify({
      tag_name: release.tagName,
      name: release.name || release.tagName,
      description: release.body || "",
      released_at: release.publishedAt,
      ref: release.targetCommitish,
    }),
  });
  return normalizeRelease(item);
}

async function uploadReleaseAsset(context, source, release, asset) {
  const body = new FormData();
  body.set("file", asset.blob, asset.name);
  const upload = await api(context, `/projects/${projectPath(context.config, source.name)}/uploads`, {
    method: "POST",
    body,
    json: false,
  });
  return api(context, `/projects/${projectPath(context.config, source.name)}/releases/${encodeURIComponent(release.tagName)}/assets/links`, {
    method: "POST",
    body: JSON.stringify({ name: asset.name, url: absoluteUrl(context.config.webBaseUrl, upload.full_path || upload.url) }),
  });
}

async function deleteRelease(context, source, release) {
  return api(context, `/projects/${projectPath(context.config, source.name)}/releases/${encodeURIComponent(release.tagName)}`, {
    method: "DELETE",
  });
}

async function deleteReleaseAsset(context, source, release, asset) {
  return api(context, `/projects/${projectPath(context.config, source.name)}/releases/${encodeURIComponent(release.tagName)}/assets/links/${asset.id}`, {
    method: "DELETE",
  });
}

function api(context, path, options = {}) {
  const headers = { accept: "application/json" };
  if (context.token) headers["private-token"] = context.token;
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
    fullName: item.path_with_namespace,
    defaultBranch: item.default_branch,
    htmlUrl: item.web_url,
    archived: Boolean(item.archived),
    description: item.description || "",
  };
}

function normalizeRelease(item) {
  return {
    id: item.tag_name,
    tagName: item.tag_name,
    name: item.name || item.tag_name,
    body: item.description || "",
    prerelease: Boolean(item.upcoming_release),
    publishedAt: item.released_at || item.created_at,
    assets: item.assets?.links || [],
  };
}

function projectPath(config, name) {
  return encodeURIComponent(`${config.namespace}/${safeName(name)}`);
}

function safeName(value) {
  if (typeof value !== "string" || !SAFE_NAME.test(value) || value === "." || value === "..") {
    throw new Error(`unsafe repository name: ${String(value)}`);
  }
  return value;
}

function validateConfig(config) {
  safeName(config.namespace);
  if (!Number.isInteger(config.namespaceId)) throw new Error("GitLab namespaceId is required");
  if (!config.apiBaseUrl || !config.webBaseUrl) throw new Error("invalid GitLab.com platform URLs");
}

function absoluteUrl(base, path) {
  return path.startsWith("http") ? path : `${trim(base)}${path.startsWith("/") ? "" : "/"}${path}`;
}

function trim(value) {
  return value.replace(/\/+$/, "");
}
