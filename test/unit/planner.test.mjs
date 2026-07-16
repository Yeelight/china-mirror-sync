import assert from "node:assert/strict";
import test from "node:test";

import { planRepositorySync } from "../../src/core/planner.mjs";

test("creates a missing target repository", () => {
  const plan = planRepositorySync({ source: snapshot("new"), target: null, previous: null });
  assert.equal(plan.status, "create");
  assert.equal(plan.writeAllowed, true);
});

test("adopts an existing repository only when its refs already match", () => {
  const source = snapshot("same");
  const aligned = planRepositorySync({ source, target: snapshot("same"), previous: null });
  const drifted = planRepositorySync({ source, target: snapshot("different"), previous: null });

  assert.equal(aligned.status, "adopt");
  assert.equal(aligned.writeAllowed, true);
  assert.equal(drifted.status, "drifted");
  assert.equal(drifted.writeAllowed, false);
});

test("updates a managed target only when it still matches the previous state", () => {
  const previous = snapshot("old");
  const source = snapshot("new");
  const safe = planRepositorySync({ source, target: snapshot("old"), previous });
  const unsafe = planRepositorySync({ source, target: snapshot("manual"), previous });

  assert.equal(safe.status, "update");
  assert.equal(safe.writeAllowed, true);
  assert.equal(unsafe.status, "drifted");
  assert.equal(unsafe.writeAllowed, false);
});

function snapshot(value) {
  return { refs: { "refs/heads/main": value } };
}
