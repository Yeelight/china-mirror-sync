import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { redactText } from "./redact.mjs";

const execFileAsync = promisify(execFile);
const ALLOWED_REF = /^refs\/(?:heads|tags|notes)\/.+/;
const REF_SPECS = [
  "+refs/heads/*:refs/mirror/source/heads/*",
  "+refs/tags/*:refs/mirror/source/tags/*",
  "+refs/notes/*:refs/mirror/source/notes/*",
];
const LS_REMOTE_PATTERNS = ["refs/heads/*", "refs/tags/*", "refs/notes/*"];

export function planRefChanges({ source, target, previous }) {
  validateRefs(source, "source");
  validateRefs(target, "target");
  validateRefs(previous, "previous");

  for (const [ref, targetOid] of Object.entries(target)) {
    const previousOid = previous[ref];
    if (previousOid !== undefined && previousOid !== targetOid) {
      throw new Error(`target drift detected at ${ref}`);
    }
    if (previousOid === undefined && source[ref] !== targetOid) {
      throw new Error(`unmanaged target ref blocks synchronization: ${ref}`);
    }
  }

  const changes = [];
  const refs = new Set([...Object.keys(source), ...Object.keys(previous)]);
  for (const ref of [...refs].sort()) {
    const sourceOid = source[ref];
    const targetOid = target[ref];
    const previousOid = previous[ref];
    if (sourceOid === targetOid) continue;
    if (sourceOid === undefined) {
      if (previousOid !== undefined && targetOid === previousOid) {
        changes.push(change("delete", ref, null, targetOid));
      }
      continue;
    }
    changes.push(change(targetOid === undefined ? "create" : "update", ref, sourceOid, targetOid ?? null));
  }
  return changes;
}

export async function listRemoteRefs(remoteUrl, { credential, git = runGit } = {}) {
  const credentials = credential ? [credential] : [];
  return withGitCredentials(credentials, async (environment) => {
    const output = await git(["ls-remote", "--refs", remoteUrl, ...LS_REMOTE_PATTERNS], { environment, secrets: credentials.map((item) => item.token) });
    const refs = {};
    for (const line of output.trim().split("\n")) {
      if (!line) continue;
      const [oid, ref] = line.split("\t");
      if (!ALLOWED_REF.test(ref)) throw new Error(`unsupported remote ref: ${ref}`);
      refs[ref] = oid;
    }
    return refs;
  });
}

export async function synchronizeGitRepository({
  sourceUrl,
  targetUrl,
  previousRefs = null,
  sourceCredential,
  targetCredential,
  dryRun = true,
  git = runGit,
}) {
  const [sourceRefs, targetRefs] = await Promise.all([
    listRemoteRefs(sourceUrl, { credential: sourceCredential, git }),
    listRemoteRefs(targetUrl, { credential: targetCredential, git }),
  ]);

  let managedRefs = previousRefs;
  if (managedRefs === null) {
    if (refsEqual(sourceRefs, targetRefs)) {
      return { status: "adopted", sourceRefs, targetRefs, changes: [] };
    }
    if (Object.keys(targetRefs).length > 0) throw new Error("target drift blocks first-time adoption");
    managedRefs = {};
  }
  const changes = planRefChanges({ source: sourceRefs, target: targetRefs, previous: managedRefs });
  if (dryRun || changes.length === 0) {
    return { status: changes.length ? "planned" : "aligned", sourceRefs, targetRefs, changes };
  }

  const directory = await mkdtemp(join(tmpdir(), "china-mirror-git-"));
  const credentials = [sourceCredential, targetCredential].filter(Boolean);
  try {
    await withGitCredentials(credentials, async (environment) => {
      const options = { cwd: directory, environment, secrets: credentials.map((item) => item.token) };
      await git(["init", "--bare"], options);
      await git(["remote", "add", "source", sourceUrl], options);
      await git(["remote", "add", "target", targetUrl], options);
      await git(["fetch", "--no-tags", "--prune", "source", ...REF_SPECS], options);
      for (const change of changes) {
        await git(pushArguments(change), options);
      }
    });
    const writtenRefs = await listRemoteRefs(targetUrl, { credential: targetCredential, git });
    if (!refsEqual(sourceRefs, writtenRefs)) throw new Error("target ref verification failed after push");
    return { status: "updated", sourceRefs, targetRefs: writtenRefs, changes };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function pushArguments(change) {
  const lease = `--force-with-lease=${change.ref}:${change.expectedTargetOid || ""}`;
  if (change.action === "delete") return ["push", "--porcelain", lease, "target", `:${change.ref}`];
  const sourceRef = `refs/mirror/source/${change.ref.slice("refs/".length)}`;
  return ["push", "--porcelain", lease, "target", `${sourceRef}:${change.ref}`];
}

async function withGitCredentials(credentials, callback) {
  if (credentials.length === 0) return callback({});
  const directory = await mkdtemp(join(tmpdir(), "china-mirror-credentials-"));
  const credentialFile = join(directory, "credentials");
  try {
    const entries = credentials.map(({ baseUrl, username, token }) => {
      const url = new URL(baseUrl);
      url.username = username;
      url.password = token;
      return url.href;
    });
    await writeFile(credentialFile, `${entries.join("\n")}\n`, { mode: 0o600 });
    return await callback({
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "credential.helper",
      GIT_CONFIG_VALUE_0: `store --file=${credentialFile}`,
      GIT_TERMINAL_PROMPT: "0",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function runGit(args, { cwd, environment = {}, secrets = [] } = {}) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      env: { ...process.env, ...environment },
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    const detail = error.stderr || error.stdout || error.message;
    throw new Error(redactText(`git ${args[0]} failed: ${detail}`, secrets), { cause: error });
  }
}

function change(action, ref, sourceOid, expectedTargetOid) {
  return { action, ref, sourceOid, expectedTargetOid };
}

function validateRefs(refs, label) {
  if (!refs || typeof refs !== "object" || Array.isArray(refs)) throw new Error(`${label} refs are invalid`);
  for (const [ref, oid] of Object.entries(refs)) {
    if (!ALLOWED_REF.test(ref)) throw new Error(`unsupported ${label} ref: ${ref}`);
    if (typeof oid !== "string" || oid.length === 0) throw new Error(`invalid object id for ${ref}`);
  }
}

function refsEqual(left, right) {
  return JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort());
}
