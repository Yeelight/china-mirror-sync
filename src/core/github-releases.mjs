const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

export async function listGitHubReleases({ owner, repository, token, fetchImpl = fetch }) {
  safeName(owner, "owner");
  safeName(repository, "repository");
  const releases = [];
  let url = new URL(`https://api.github.com/repos/${owner}/${repository}/releases`);
  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", "1");

  while (url) {
    const headers = {
      accept: "application/vnd.github+json",
      "user-agent": "yeelight-china-mirror-sync",
      "x-github-api-version": "2022-11-28",
    };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`GitHub release discovery failed with HTTP ${response.status}`);
    const items = await response.json();
    if (!Array.isArray(items)) throw new Error("GitHub releases response is not an array");
    releases.push(...items.map(normalizeRelease));
    url = nextPage(response.headers.get("link"));
  }
  return releases;
}

function normalizeRelease(item) {
  return {
    id: item.id,
    tagName: item.tag_name,
    name: item.name || item.tag_name,
    body: item.body || "",
    canonicalUrl: item.html_url,
    draft: Boolean(item.draft),
    prerelease: Boolean(item.prerelease),
    createdAt: item.created_at,
    publishedAt: item.published_at,
    targetCommitish: item.target_commitish,
    assets: (item.assets || []).map((asset) => ({
      id: asset.id,
      name: asset.name,
      size: asset.size,
      digest: asset.digest || null,
      downloadUrl: asset.browser_download_url,
      contentType: asset.content_type,
      downloadCount: asset.download_count,
    })),
  };
}

function nextPage(link) {
  if (!link) return null;
  for (const part of link.split(",")) {
    const match = part.trim().match(/^<([^>]+)>;\s*rel="([^"]+)"$/);
    if (match?.[2] === "next") return new URL(match[1]);
  }
  return null;
}

function safeName(value, label) {
  if (typeof value !== "string" || !SAFE_NAME.test(value) || value === "." || value === "..") {
    throw new Error(`unsafe GitHub ${label}: ${String(value)}`);
  }
}
