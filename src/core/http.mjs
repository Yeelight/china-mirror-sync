import { redactText } from "./redact.mjs";

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export class HttpError extends Error {
  constructor(message, { status, url, retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = "HttpError";
    this.status = status;
    this.url = url;
    this.retryable = retryable;
  }
}

export async function requestJson(url, options = {}) {
  const {
    fetchImpl = fetch,
    retries = 3,
    sleep = defaultSleep,
    secrets = [],
    timeoutMs = 30_000,
    ...requestOptions
  } = options;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        ...requestOptions,
        signal: requestOptions.signal || AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) return await parseJson(response);

      const retryable = RETRYABLE_STATUS.has(response.status);
      const message = redactText(`HTTP ${response.status} ${response.statusText} for ${url}`, secrets);
      if (!retryable || attempt === retries) {
        throw new HttpError(message, { status: response.status, url: redactText(url, secrets), retryable });
      }
    } catch (error) {
      if (error instanceof HttpError && !error.retryable) throw error;
      if (attempt === retries) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(redactText(`request failed for ${url}: ${error.message}`, secrets), {
          url: redactText(url, secrets),
          retryable: true,
          cause: error,
        });
      }
    }
    await sleep(backoffDelay(attempt));
  }
  throw new Error("unreachable");
}

async function parseJson(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function backoffDelay(attempt) {
  return Math.min(1_000 * (2 ** attempt), 10_000);
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
