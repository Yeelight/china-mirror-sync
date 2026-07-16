const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

export async function discoverPublicRepositories({
  organization,
  token,
  fetchImpl = fetch,
}) {
  assertSafeName(organization, "GitHub organization");
  const repositories = [];
  let url = new URL(`https://api.github.com/orgs/${organization}/repos`);
  url.searchParams.set("type", "public");
  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", "1");

  while (url) {
    const headers = {
      accept: "application/vnd.github+json",
      "user-agent": "yeelight-china-mirror-sync",
      "x-github-api-version": "2022-11-28",
    };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetchImpl(url, { headers });
    if (!response.ok) {
      throw new Error(`GitHub repository discovery failed with HTTP ${response.status}`);
    }
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error("GitHub repository discovery returned a non-array response");
    for (const item of page) {
      assertSafeName(item.name, "GitHub repository name");
      if (item.private || (item.visibility && item.visibility !== "public")) continue;
      repositories.push(normalizeRepository(item));
    }
    url = nextPage(response.headers.get("link"));
  }

  return repositories.sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base" }));
}

function normalizeRepository(item) {
  return {
    githubId: item.id,
    nodeId: item.node_id,
    name: item.name,
    fullName: item.full_name,
    defaultBranch: item.default_branch,
    archived: Boolean(item.archived),
    fork: Boolean(item.fork),
    description: item.description || "",
    homepage: item.homepage || "",
    topics: Array.isArray(item.topics) ? item.topics : [],
    cloneUrl: item.clone_url,
    htmlUrl: item.html_url,
    hasWiki: Boolean(item.has_wiki),
    pushedAt: item.pushed_at,
    sizeKb: Number(item.size || 0),
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

function assertSafeName(value, label) {
  if (typeof value !== "string" || !SAFE_NAME.test(value) || value === "." || value === "..") {
    throw new Error(`unsafe ${label}: ${String(value)}`);
  }
}
