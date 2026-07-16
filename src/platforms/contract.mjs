const REQUIRED_METHODS = [
  "capabilities",
  "getRepository",
  "createRepository",
  "updateRepositoryMetadata",
  "gitRemote",
  "getWikiRemote",
  "listReleases",
  "createOrUpdateRelease",
  "deleteRelease",
  "listReleaseAssets",
  "uploadReleaseAsset",
  "deleteManagedReleaseAsset",
  "audit",
];

const CAPABILITY_VALUES = new Set(["supported", "unsupported"]);

export function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") throw new Error("platform adapter must be an object");
  if (typeof adapter.id !== "string" || !/^[a-z0-9-]+$/.test(adapter.id)) {
    throw new Error("platform adapter id is invalid");
  }
  for (const method of REQUIRED_METHODS) {
    if (typeof adapter[method] !== "function") throw new Error(`platform adapter is missing ${method}`);
  }
  const capabilities = adapter.capabilities();
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) {
    throw new Error("platform capabilities must be an object");
  }
  for (const [name, value] of Object.entries(capabilities)) {
    if (!CAPABILITY_VALUES.has(value)) throw new Error(`invalid capability ${name}: ${String(value)}`);
  }
  return adapter;
}
