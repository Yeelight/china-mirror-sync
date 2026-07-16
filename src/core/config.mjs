import { readFile as readFileDefault } from "node:fs/promises";

export async function loadConfiguration(directoryUrl, { readFile = readFileDefault } = {}) {
  const [policy, platformDocument] = await Promise.all([
    readJson(new URL("policy.json", directoryUrl), readFile),
    readJson(new URL("platforms.json", directoryUrl), readFile),
  ]);
  validatePolicy(policy);
  if (!Array.isArray(platformDocument.platforms) || platformDocument.platforms.length === 0) {
    throw new Error("platforms.json must define at least one platform");
  }
  const ids = new Set();
  for (const platform of platformDocument.platforms) {
    if (typeof platform.id !== "string" || !/^[a-z0-9-]+$/.test(platform.id)) {
      throw new Error("invalid platform id");
    }
    if (ids.has(platform.id)) throw new Error(`duplicate platform id: ${platform.id}`);
    ids.add(platform.id);
  }
  return { policy, platforms: platformDocument.platforms };
}

async function readJson(url, readFile) {
  return JSON.parse(await readFile(url, "utf8"));
}

function validatePolicy(policy) {
  if (!policy?.source?.organization) throw new Error("policy source organization is required");
  if (!policy?.schedule?.assetSyncFrom || !Number.isFinite(Date.parse(policy.schedule.assetSyncFrom))) {
    throw new Error("policy assetSyncFrom must be a valid date");
  }
  if (policy?.releases?.initialAssets !== "latest-stable") {
    throw new Error("policy initial release asset strategy must be latest-stable");
  }
  if (!Array.isArray(policy?.git?.namespaces) || policy.git.namespaces.length === 0) {
    throw new Error("policy git namespaces are required");
  }
}
