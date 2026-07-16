import assert from "node:assert/strict";
import test from "node:test";

import { HttpError, requestJson } from "../../src/core/http.mjs";

test("retries transient HTTP responses and returns parsed JSON", async () => {
  let attempts = 0;
  const response = await requestJson("https://example.com/api", {
    fetchImpl: async () => {
      attempts += 1;
      if (attempts < 3) return new Response("busy", { status: 503 });
      return Response.json({ ok: true });
    },
    retries: 2,
    sleep: async () => {},
  });

  assert.deepEqual(response, { ok: true });
  assert.equal(attempts, 3);
});

test("does not retry authentication failures or expose response secrets", async () => {
  let attempts = 0;
  await assert.rejects(
    requestJson("https://example.com/api", {
      fetchImpl: async () => {
        attempts += 1;
        return new Response('{"token":"server-secret"}', { status: 401 });
      },
      retries: 3,
      secrets: ["server-secret"],
    }),
    (error) => error instanceof HttpError
      && error.status === 401
      && !error.message.includes("server-secret"),
  );
  assert.equal(attempts, 1);
});
