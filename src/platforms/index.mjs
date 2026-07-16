import { createGiteeLikeAdapter } from "./gitee-like.mjs";
import { createGitCodeAdapter } from "./gitcode.mjs";
import { createGitLabComAdapter } from "./gitlab-com.mjs";

export function createPlatformAdapter(config, options = {}) {
  switch (config.adapter) {
    case "gitee":
      return createGiteeLikeAdapter(config, { ...options, authHeader: "authorization", authPrefix: "token " });
    case "gitcode":
      return createGitCodeAdapter(config, options);
    case "gitlab-com":
      return createGitLabComAdapter(config, options);
    default:
      throw new Error(`unsupported platform adapter: ${String(config.adapter)}`);
  }
}
