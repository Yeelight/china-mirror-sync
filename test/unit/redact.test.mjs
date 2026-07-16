import assert from "node:assert/strict";
import test from "node:test";

import { redactText } from "../../src/core/redact.mjs";

test("redacts registered secrets, authorization headers, and URL credentials", () => {
  const input = [
    "token=super-secret-token",
    "Authorization: Bearer another-secret-token",
    "https://oauth2:third-secret-token@gitlab.com/Yeelight/repo.git",
  ].join("\n");

  const output = redactText(input, ["super-secret-token", "another-secret-token", "third-secret-token"]);

  assert.doesNotMatch(output, /super-secret-token|another-secret-token|third-secret-token/);
  assert.match(output, /\*\*\*\*/);
});
