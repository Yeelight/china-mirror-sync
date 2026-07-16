import assert from "node:assert/strict";
import test from "node:test";

import { planRefChanges } from "../../src/core/git-sync.mjs";

test("plans create update and managed deletion with leases", () => {
  const plan = planRefChanges({
    source: { "refs/heads/main": "new", "refs/tags/v2": "tag2" },
    target: { "refs/heads/main": "old", "refs/tags/v1": "tag1" },
    previous: { "refs/heads/main": "old", "refs/tags/v1": "tag1" },
  });

  assert.deepEqual(plan, [
    { action: "update", ref: "refs/heads/main", sourceOid: "new", expectedTargetOid: "old" },
    { action: "delete", ref: "refs/tags/v1", sourceOid: null, expectedTargetOid: "tag1" },
    { action: "create", ref: "refs/tags/v2", sourceOid: "tag2", expectedTargetOid: null },
  ]);
});

test("force-overwrites drift and deletes target-only refs using observed leases", () => {
  const plan = planRefChanges({
    source: { "refs/heads/main": "new" },
    target: { "refs/heads/main": "manual", "refs/heads/target-only": "extra" },
    previous: { "refs/heads/main": "old" },
  });

  assert.deepEqual(plan, [
    { action: "update", ref: "refs/heads/main", sourceOid: "new", expectedTargetOid: "manual" },
    { action: "delete", ref: "refs/heads/target-only", sourceOid: null, expectedTargetOid: "extra" },
  ]);
});

test("never mirrors GitHub pull request refs", () => {
  assert.throws(() => planRefChanges({
    source: { "refs/pull/1/head": "oid" },
    target: {},
    previous: {},
  }), /unsupported source ref/);
});
