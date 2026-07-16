import { requestJson } from "../core/http.mjs";
import { createGiteeLikeAdapter } from "./gitee-like.mjs";

export function createGitCodeAdapter(config, { token, fetchImpl = fetch } = {}) {
  const base = createGiteeLikeAdapter(config, {
    token,
    fetchImpl,
    authHeader: "private-token",
    authPrefix: "",
    releaseNormalizer: normalizeGitCodeRelease,
  });
  const context = { config, token, fetchImpl };
  return {
    ...base,
    listReleaseAssets: async (_source, release) => release.assets || [],
    uploadReleaseAsset: (source, release, asset) => uploadReleaseAsset(context, source, release, asset),
    deleteManagedReleaseAsset: (source, release, asset) => deleteReleaseAsset(context, source, release, asset),
  };
}

async function uploadReleaseAsset(context, source, release, asset) {
  const uploadUrl = new URL(apiUrl(context, source, release, "upload_url"));
  uploadUrl.searchParams.set("file_name", asset.name);
  const descriptor = await requestJson(uploadUrl, {
    fetchImpl: context.fetchImpl,
    headers: apiHeaders(context),
    secrets: [context.token],
  });
  if (!descriptor?.url || !descriptor.headers || typeof descriptor.headers !== "object") {
    throw new Error(`GitCode returned an invalid release upload descriptor for ${asset.name}`);
  }
  const response = await context.fetchImpl(descriptor.url, {
    method: "PUT",
    headers: descriptor.headers,
    body: asset.blob,
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  if (!response.ok) throw new Error(`GitCode release asset upload failed with HTTP ${response.status}: ${asset.name}`);
  const text = await response.text();
  if (!text) return { name: asset.name, size: asset.size };
  try {
    return JSON.parse(text);
  } catch {
    return { name: asset.name, size: asset.size };
  }
}

function deleteReleaseAsset(context, source, release, asset) {
  const attachmentId = asset.id || asset.attach_file_id || asset.attachment_id;
  if (!attachmentId) throw new Error(`GitCode release attachment id is missing: ${release.tagName}/${asset.name}`);
  return requestJson(apiUrl(context, source, release, `attach_files/${encodeURIComponent(attachmentId)}`), {
    method: "DELETE",
    fetchImpl: context.fetchImpl,
    headers: apiHeaders(context),
    secrets: [context.token],
  });
}

function normalizeGitCodeRelease(item) {
  return {
    id: item.tag_name,
    tagName: item.tag_name,
    name: item.name || item.tag_name,
    body: item.body || "",
    prerelease: Boolean(item.prerelease),
    publishedAt: item.created_at,
    assets: (item.assets || [])
      .filter((asset) => asset.type !== "source")
      .map((asset) => ({
        ...asset,
        id: asset.id || asset.attach_file_id || asset.attachment_id,
        name: asset.name || asset.file_name,
        size: asset.size || asset.file_size,
      })),
  };
}

function apiUrl(context, source, release, suffix) {
  const owner = encodeURIComponent(context.config.namespace);
  const repository = encodeURIComponent(source.name);
  const tag = encodeURIComponent(release.tagName || release.id);
  return `${context.config.apiBaseUrl.replace(/\/+$/, "")}/repos/${owner}/${repository}/releases/${tag}/${suffix}`;
}

function apiHeaders(context) {
  const headers = { accept: "application/json" };
  if (context.token) headers["private-token"] = context.token;
  return headers;
}
