import { planRepositorySync } from "./planner.mjs";
import { auditRepository } from "./audit.mjs";

export async function auditMirrors({
  organization,
  platforms,
  repositoryFilter = "all",
  platformFilter = "all",
  discoverRepositories,
  createAdapter,
  listRefs,
  listSourceReleases,
  selectAssetTags,
  readState,
}) {
  const repositories = (await discoverRepositories()).filter((repository) => matches(repository.name, repositoryFilter));
  const selectedPlatforms = platforms.filter((platform) => matches(platform.id, platformFilter));
  assertSelection(repositories, selectedPlatforms, repositoryFilter, platformFilter);

  const audits = [];
  for (const platform of selectedPlatforms) {
    const adapter = createAdapter(platform);
    for (const source of repositories) {
      try {
        const target = await adapter.getRepository(source);
        if (!target) {
          audits.push({
            platform: platform.id,
            repository: source.name,
            githubId: source.githubId,
            ...auditRepository({ source, target: null, capabilities: adapter.capabilities() }),
          });
          continue;
        }
        const [sourceRefs, targetRefs, previous, sourceReleases, listedTargetReleases] = await Promise.all([
          listRefs(source.cloneUrl),
          listRefs(adapter.gitRemote(source)),
          readState(platform.id, source.githubId),
          listSourceReleases(source),
          adapter.listReleases(source),
        ]);
        const targetReleases = await Promise.all(listedTargetReleases.map(async (release) => ({
          ...release,
          assets: await adapter.listReleaseAssets(source, release),
        })));
        const audit = auditRepository({
          source: { ...source, refs: sourceRefs, releases: sourceReleases },
          target: { ...target, refs: targetRefs, releases: targetReleases },
          previous,
          capabilities: adapter.capabilities(),
          selectedTags: selectAssetTags(sourceReleases),
        });
        audits.push({
          platform: platform.id,
          repository: source.name,
          githubId: source.githubId,
          ...audit,
        });
      } catch (error) {
        audits.push({
          platform: platform.id,
          repository: source.name,
          githubId: source.githubId,
          status: "failed",
          dimensions: { repository: { status: "failed", reason: error.message } },
        });
      }
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    sourceOrganization: organization,
    repositories,
    audits,
    summary: summarize(audits),
  };
}

export async function planMirrors({
  organization,
  platforms,
  repositoryFilter = "all",
  platformFilter = "all",
  discoverRepositories,
  createAdapter,
  listRefs,
  readState,
}) {
  const repositories = (await discoverRepositories()).filter((repository) => matches(repository.name, repositoryFilter));
  const selectedPlatforms = platforms.filter((platform) => matches(platform.id, platformFilter));
  assertSelection(repositories, selectedPlatforms, repositoryFilter, platformFilter);

  const plans = [];
  for (const platform of selectedPlatforms) {
    const adapter = createAdapter(platform);
    for (const source of repositories) {
      try {
        const target = await adapter.getRepository(source);
        const [sourceRefs, targetRefs, previous] = await Promise.all([
          listRefs(source.cloneUrl),
          target ? listRefs(adapter.gitRemote(source)) : Promise.resolve(null),
          readState(platform.id, source.githubId),
        ]);
        const plan = planRepositorySync({
          source: { refs: sourceRefs },
          target: target ? { refs: targetRefs } : null,
          previous: previous ? { refs: previous.refs } : null,
        });
        plans.push({
          platform: platform.id,
          repository: source.name,
          githubId: source.githubId,
          status: plan.status,
          writeAllowed: plan.writeAllowed,
          sourceRefCount: Object.keys(sourceRefs).length,
          targetRefCount: Object.keys(targetRefs || {}).length,
        });
      } catch (error) {
        plans.push({
          platform: platform.id,
          repository: source.name,
          githubId: source.githubId,
          status: "failed",
          writeAllowed: false,
          error: error.message,
        });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceOrganization: organization,
    repositories,
    plans,
    summary: summarize(plans),
  };
}

export async function synchronizeMirrors({
  organization,
  platforms,
  repositoryFilter = "all",
  platformFilter = "all",
  discoverRepositories,
  createAdapter,
  syncGit,
  syncReleases,
  readState,
  writeState,
  sourceCredential,
  targetCredential,
}) {
  const repositories = (await discoverRepositories()).filter((repository) => matches(repository.name, repositoryFilter));
  const selectedPlatforms = platforms.filter((platform) => matches(platform.id, platformFilter));
  assertSelection(repositories, selectedPlatforms, repositoryFilter, platformFilter);

  const plans = [];
  for (const platform of selectedPlatforms) {
    const adapter = createAdapter(platform);
    for (const source of repositories) {
      try {
        let target = await adapter.getRepository(source);
        const previous = await readState(platform.id, source.githubId);
        const missing = target === null;
        if (missing) target = await adapter.createRepository(source);
        const result = await syncGit({
          sourceUrl: source.cloneUrl,
          targetUrl: adapter.gitRemote(source),
          previousRefs: missing ? {} : (previous?.refs ?? null),
          sourceCredential,
          targetCredential: targetCredential?.(platform),
          dryRun: false,
        });
        await adapter.updateRepositoryMetadata(source, target);
        const releaseResult = syncReleases ? await syncReleases({
          source,
          adapter,
          managedAssets: previous?.managedAssets || {},
        }) : { managedAssets: previous?.managedAssets || {} };
        await writeState(platform.id, source.githubId, {
          schemaVersion: 1,
          githubId: source.githubId,
          repository: source.name,
          platform: platform.id,
          refs: result.sourceRefs,
          managedAssets: releaseResult.managedAssets,
          synchronizedAt: new Date().toISOString(),
        });
        plans.push({
          platform: platform.id,
          repository: source.name,
          githubId: source.githubId,
          status: result.status,
          changes: result.changes.length,
        });
      } catch (error) {
        plans.push({
          platform: platform.id,
          repository: source.name,
          githubId: source.githubId,
          status: "failed",
          error: error.message,
        });
      }
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    sourceOrganization: organization,
    repositories,
    plans,
    summary: summarize(plans),
  };
}

function summarize(plans) {
  return plans.reduce((summary, plan) => {
    summary[plan.status] = (summary[plan.status] || 0) + 1;
    return summary;
  }, {});
}

function matches(value, filter) {
  return filter === "all" || value === filter;
}

function assertSelection(repositories, platforms, repositoryFilter, platformFilter) {
  if (repositories.length === 0) throw new Error(`repository filter matched nothing: ${repositoryFilter}`);
  if (platforms.length === 0) throw new Error(`platform filter matched nothing: ${platformFilter}`);
}
