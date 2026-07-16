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

test("stops when a target ref differs from the last managed value", () => {
  assert.throws(() => planRefChanges({
    source: { "refs/heads/main": "new" },
    target: { "refs/heads/main": "manual" },
    previous: { "refs/heads/main": "old" },
  }), /target drift.*refs\/heads\/main/);
});

test("never mirrors GitHub pull request refs", () => {
  assert.throws(() => planRefChanges({
    source: { "refs/pull/1/head": "oid" },
    target: {},
    previous: {},
  }), /unsupported source ref/);
});
