export function planRepositorySync({ source, target, previous }) {
  assertSnapshot(source, "source");
  if (target === null) return plan("create", true);
  assertSnapshot(target, "target");

  if (previous === null) {
    return refsEqual(source.refs, target.refs)
      ? plan("adopt", true)
      : plan("overwrite", true);
  }

  assertSnapshot(previous, "previous");
  if (refsEqual(source.refs, target.refs)) return plan("aligned", false);
  if (!refsEqual(target.refs, previous.refs)) return plan("overwrite", true);
  return plan("update", true);
}

function plan(status, writeAllowed) {
  return { status, writeAllowed };
}

function assertSnapshot(snapshot, label) {
  if (!snapshot || typeof snapshot !== "object" || !snapshot.refs || typeof snapshot.refs !== "object") {
    throw new Error(`${label} repository snapshot is invalid`);
  }
}

function refsEqual(left, right) {
  const leftEntries = Object.entries(left).sort(compareEntries);
  const rightEntries = Object.entries(right).sort(compareEntries);
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}

function compareEntries(left, right) {
  return left[0].localeCompare(right[0]);
}
