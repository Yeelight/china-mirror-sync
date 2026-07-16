import { createGiteeLikeAdapter } from "./gitee-like.mjs";
import { createGitLabComAdapter } from "./gitlab-com.mjs";

export function createPlatformAdapter(config, options = {}) {
  switch (config.adapter) {
    case "gitee":
      return createGiteeLikeAdapter(config, { ...options, authHeader: "authorization", authPrefix: "token " });
    case "gitcode":
      return createGiteeLikeAdapter(config, { ...options, authHeader: "private-token", authPrefix: "" });
    case "gitlab-com":
      return createGitLabComAdapter(config, options);
    default:
      throw new Error(`unsupported platform adapter: ${String(config.adapter)}`);
  }
}
