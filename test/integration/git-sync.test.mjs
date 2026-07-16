import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { listRemoteRefs, synchronizeGitRepository } from "../../src/core/git-sync.mjs";

test("synchronizes allowed refs and rejects target-side drift", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "china-mirror-sync-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "source.git");
  const target = join(root, "target.git");
  const work = join(root, "work");
  git(["init", "--bare", source]);
  git(["init", "--bare", target]);
  git(["clone", source, work]);
  git(["config", "user.name", "Mirror Test"], work);
  git(["config", "user.email", "mirror@example.com"], work);
  await writeFile(join(work, "README.md"), "first\n");
  git(["add", "README.md"], work);
  git(["commit", "-m", "first"], work);
  git(["branch", "-M", "main"], work);
  git(["tag", "v1"], work);
  git(["push", "origin", "main", "v1"], work);

  const first = await synchronizeGitRepository({ sourceUrl: source, targetUrl: target, previousRefs: {}, dryRun: false });
  assert.equal(first.status, "updated");
  assert.deepEqual(await listRemoteRefs(target), first.sourceRefs);

  const previous = first.sourceRefs;
  git(["tag", "-d", "v1"], work);
  await writeFile(join(work, "README.md"), "second\n");
  git(["commit", "-am", "second"], work);
  git(["push", "--force", "origin", "main", ":refs/tags/v1"], work);
  const second = await synchronizeGitRepository({ sourceUrl: source, targetUrl: target, previousRefs: previous, dryRun: false });
  assert.equal(second.changes.some((change) => change.action === "delete" && change.ref === "refs/tags/v1"), true);

  git(["update-ref", "refs/heads/main", previous["refs/heads/main"]], target);
  await assert.rejects(
    synchronizeGitRepository({ sourceUrl: source, targetUrl: target, previousRefs: second.sourceRefs, dryRun: false }),
    /target drift/,
  );
});

function git(args, cwd) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}
