#!/usr/bin/env node

import { resolve } from "node:path";

import { loadConfiguration } from "./core/config.mjs";
import { discoverPublicRepositories } from "./core/discovery.mjs";
import { listRemoteRefs, synchronizeGitRepository } from "./core/git-sync.mjs";
import { listGitHubReleases } from "./core/github-releases.mjs";
import { executeReleaseSync } from "./core/release-sync.mjs";
import { selectReleaseAssets } from "./core/release-policy.mjs";
import { planMirrors, synchronizeMirrors } from "./core/runner.mjs";
import { readPlatformState, writePlatformState } from "./core/state.mjs";
import { createPlatformAdapter } from "./platforms/index.mjs";

const { command, options } = parseArguments(process.argv.slice(2));
if (!["plan", "audit", "sync"].includes(command)) usage(`unsupported command: ${command}`);

const configuration = await loadConfiguration(new URL("../config/", import.meta.url));
const stateDirectory = resolve(options.stateDir || ".mirror-state");
const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

const shared = {
  organization: configuration.policy.source.organization,
  platforms: configuration.platforms,
  repositoryFilter: options.repository || "all",
  platformFilter: options.platform || "all",
  discoverRepositories: () => discoverPublicRepositories({
    organization: configuration.policy.source.organization,
    token: githubToken,
  }),
  createAdapter: (platform) => createPlatformAdapter(platform, { token: process.env.MIRROR_TOKEN || process.env[platform.tokenSecret] }),
};

const report = command === "sync" ? await synchronizeMirrors({
  ...shared,
  syncGit: synchronizeGitRepository,
  syncReleases: async ({ source, adapter, managedAssets }) => {
    const sourceReleases = await listGitHubReleases({
      owner: configuration.policy.source.organization,
      repository: source.name,
      token: githubToken,
    });
    return executeReleaseSync({
      sourceRepository: source,
      sourceReleases,
      selectedTags: selectReleaseAssets(sourceReleases, {
        assetSyncFrom: configuration.policy.schedule.assetSyncFrom,
      }),
      managedAssets,
      adapter,
      githubToken,
    });
  },
  readState: (platformId, githubId) => readPlatformState(stateDirectory, platformId, githubId),
  writeState: (platformId, githubId, state) => writePlatformState(stateDirectory, platformId, githubId, state),
  sourceCredential: githubToken ? { baseUrl: "https://github.com", username: "x-access-token", token: githubToken } : undefined,
  targetCredential: (platform) => platformCredential(platform),
}) : await planMirrors({
  ...shared,
  listRefs: (url) => listRemoteRefs(url),
  readState: (platformId, githubId) => readPlatformState(stateDirectory, platformId, githubId),
});

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.plans.some((plan) => plan.status === "failed")) process.exitCode = 1;
else if (report.plans.some((plan) => plan.status === "drifted")) process.exitCode = 2;

function parseArguments(args) {
  const command = args.shift() || "plan";
  const options = {};
  while (args.length > 0) {
    const key = args.shift();
    if (!key.startsWith("--")) usage(`unexpected argument: ${key}`);
    const value = args.shift();
    if (!value || value.startsWith("--")) usage(`missing value for ${key}`);
    options[toCamelCase(key.slice(2))] = value;
  }
  return { command, options };
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function usage(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write("Usage: node src/cli.mjs plan|audit|sync [--platform all|id] [--repository all|name] [--state-dir path]\n");
  process.exit(64);
}

function platformCredential(platform) {
  const token = process.env.MIRROR_TOKEN || process.env[platform.tokenSecret];
  if (!token) throw new Error(`missing required secret: ${platform.tokenSecret}`);
  const username = platform.gitUsername || process.env.MIRROR_USERNAME || process.env[platform.usernameVariable];
  if (!username) throw new Error(`missing required username: ${platform.usernameVariable}`);
  return { baseUrl: platform.webBaseUrl, username, token };
}
