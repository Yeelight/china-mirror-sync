import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function readPlatformState(stateDirectory, platformId, githubId) {
  try {
    return JSON.parse(await readFile(statePath(stateDirectory, platformId, githubId), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function writePlatformState(stateDirectory, platformId, githubId, state) {
  const path = statePath(stateDirectory, platformId, githubId);
  const temporary = `${path}.${process.pid}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

function statePath(stateDirectory, platformId, githubId) {
  if (!/^[a-z0-9-]+$/.test(platformId)) throw new Error(`unsafe platform id: ${platformId}`);
  if (!Number.isInteger(Number(githubId)) || Number(githubId) <= 0) throw new Error(`invalid GitHub id: ${githubId}`);
  return join(stateDirectory, "state", "platforms", platformId, `${githubId}.json`);
}
