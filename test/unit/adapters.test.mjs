import assert from "node:assert/strict";
import test from "node:test";

import { createPlatformAdapter } from "../../src/platforms/index.mjs";
import { validateAdapter } from "../../src/platforms/contract.mjs";

for (const fixture of [
  {
    id: "gitee",
    config: platform("gitee", "https://gitee.example/api/v5", "https://gitee.example", "yeelight"),
    repositoryUrl: "https://gitee.example/api/v5/repos/yeelight/demo",
    authHeader: ["authorization", "token secret"],
    response: { id: 1, name: "demo", full_name: "yeelight/demo", default_branch: "main", html_url: "https://gitee.example/yeelight/demo" },
  },
  {
    id: "gitcode",
    config: platform("gitcode", "https://gitcode.example/api/v5", "https://gitcode.example", "Yeelight"),
    repositoryUrl: "https://gitcode.example/api/v5/repos/Yeelight/demo",
    authHeader: ["private-token", "secret"],
    response: { id: 2, name: "demo", full_name: "Yeelight/demo", default_branch: "main", html_url: "https://gitcode.example/Yeelight/demo" },
  },
]) {
  test(`${fixture.id} adapter follows the common repository contract`, async () => {
    const requests = [];
    const adapter = createPlatformAdapter(fixture.config, {
      token: "secret",
      fetchImpl: async (url, options) => {
        requests.push({ url: String(url), options });
        return Response.json(fixture.response);
      },
    });

    validateAdapter(adapter);
    const repository = await adapter.getRepository({ name: "demo" });

    assert.equal(requests[0].url, fixture.repositoryUrl);
    assert.equal(requests[0].options.headers[fixture.authHeader[0]], fixture.authHeader[1]);
    assert.equal(repository.defaultBranch, "main");
    assert.equal(adapter.gitRemote({ name: "demo" }), `${fixture.config.webBaseUrl}/${fixture.config.namespace}/demo.git`);
    await adapter.updateRepositoryMetadata({
      name: "demo",
      description: "Description",
      homepage: "https://example.com",
      defaultBranch: "main",
      hasWiki: true,
    }, repository);
    assert.equal(JSON.parse(requests[1].options.body).name, "demo");
  });
}

test("GitLab.com adapter encodes the namespace path and uses project uploads for assets", async () => {
  const requests = [];
  const config = {
    ...platform("gitlab-com", "https://gitlab.example/api/v4", "https://gitlab.example", "Yeelight"),
    namespaceId: 99,
  };
  const adapter = createPlatformAdapter(config, {
    token: "secret",
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return Response.json({ id: 42, name: "demo", path_with_namespace: "Yeelight/demo", default_branch: "main", web_url: "https://gitlab.example/Yeelight/demo" });
    },
  });

  validateAdapter(adapter);
  const repository = await adapter.getRepository({ name: "demo" });

  assert.equal(requests[0].url, "https://gitlab.example/api/v4/projects/Yeelight%2Fdemo");
  assert.equal(requests[0].options.headers["private-token"], "secret");
  assert.equal(repository.id, 42);
  assert.equal(adapter.gitRemote({ name: "demo" }), "https://gitlab.example/Yeelight/demo.git");
  assert.equal(adapter.capabilities().releaseAssetDigest, "unsupported");
});

test("GitCode uploads release assets through a signed URL and ignores source archives", async () => {
  const requests = [];
  const config = platform("gitcode", "https://gitcode.example/api/v5", "https://gitcode.example", "Yeelight");
  const adapter = createPlatformAdapter(config, {
    token: "secret",
    fetchImpl: async (url, options = {}) => {
      requests.push({ url: String(url), options });
      if (String(url).includes("upload_url")) {
        return Response.json({
          url: "https://files.example/upload?signature=signed",
          headers: { "x-storage-callback": "opaque", "content-type": "application/octet-stream" },
        });
      }
      if (String(url).startsWith("https://files.example/")) {
        return Response.json({ id: "attachment-1", name: "app.zip", size: 3 });
      }
      if (String(url).includes("/releases?")) {
        return Response.json([{
          tag_name: "v1",
          name: "v1",
          body: "notes",
          assets: [
            { type: "source", name: "v1.zip" },
            { type: "attachment", id: "attachment-1", name: "app.zip", size: 3 },
          ],
        }]);
      }
      return Response.json([]);
    },
  });

  const uploaded = await adapter.uploadReleaseAsset(
    { name: "demo" },
    { id: "v1", tagName: "v1" },
    { name: "app.zip", size: 3, blob: new Blob(["abc"]) },
  );

  assert.equal(requests[0].url, "https://gitcode.example/api/v5/repos/Yeelight/demo/releases/v1/upload_url?file_name=app.zip");
  assert.equal(requests[0].options.headers["private-token"], "secret");
  assert.equal(requests[1].options.method, "PUT");
  assert.equal(requests[1].options.headers["x-storage-callback"], "opaque");
  assert.equal(uploaded.id, "attachment-1");
  const releases = await adapter.listReleases({ name: "demo" });
  assert.equal(releases[0].id, "v1");
  assert.deepEqual(releases[0].assets.map((asset) => asset.name), ["app.zip"]);
});

test("adapters reject unsafe repository names before issuing HTTP requests", async () => {
  let called = false;
  const adapter = createPlatformAdapter(platform("gitee", "https://gitee.example/api/v5", "https://gitee.example", "yeelight"), {
    fetchImpl: async () => {
      called = true;
      return Response.json({});
    },
  });

  await assert.rejects(adapter.getRepository({ name: "../escape" }), /unsafe repository name/);
  assert.equal(called, false);
});

function platform(id, apiBaseUrl, webBaseUrl, namespace) {
  return { id, adapter: id, apiBaseUrl, webBaseUrl, namespace, tokenSecret: `${id.toUpperCase()}_TOKEN` };
}
