import { startOpenRouterProxy } from "./openrouter-proxy";

const DEFAULT_REMOTE_BASE_URL = "https://openrouter.ai/api/v1";

type HeaderEntry = {
  name: string;
  value: string;
};

function parseHeaderLines(raw?: string | null): Map<string, HeaderEntry> {
  const map = new Map<string, HeaderEntry>();
  if (!raw) {
    return map;
  }

  const trimmedRaw = raw.trim();
  if (trimmedRaw.length === 0) {
    return map;
  }

  if (trimmedRaw.startsWith("{") && trimmedRaw.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmedRaw) as Record<string, unknown>;
      for (const [name, value] of Object.entries(parsed)) {
        if (typeof value === "string" && name.trim().length > 0) {
          map.set(name.toLowerCase(), { name, value: value.trim() });
        }
      }
      return map;
    } catch (error) {
      // fall through to line parsing
    }
  }

  const lines = trimmedRaw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const name = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (name.length === 0 || value.length === 0) {
      continue;
    }

    map.set(name.toLowerCase(), { name, value });
  }

  return map;
}

function setHeader(
  headers: Map<string, HeaderEntry>,
  name: string,
  value: string,
) {
  headers.set(name.toLowerCase(), { name, value });
}

function serializeHeaders(headers: Map<string, HeaderEntry>): string {
  return Array.from(headers.values())
    .map((entry) => `${entry.name}: ${entry.value}`)
    .join("\n");
}

let proxyInitialized = false;

export function __resetOpenRouterProxyForTests() {
  proxyInitialized = false;
}

function extractModelFromClaudeArgs(args?: string): string | undefined {
  if (!args) return undefined;
  const modelMatch = args.match(/--model\s+([^\s]+)/);
  if (modelMatch) {
    return modelMatch[1];
  }
  return undefined;
}

function parseAdditionalModels(raw?: string | null): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function registerCleanup(stop: () => Promise<void>) {
  const cleanup = async () => {
    try {
      await stop();
    } catch (error) {
      console.error("Failed to stop OpenRouter proxy:", error);
    }
  };

  process.once("exit", () => {
    cleanup().catch(() => {
      // ignore errors during exit
    });
  });
  process.once("SIGINT", () => {
    cleanup().then(() => process.exit(130));
  });
  process.once("SIGTERM", () => {
    cleanup().then(() => process.exit(143));
  });
}

/**
 * Configure Claude Code environment variables for OpenRouter compatibility.
 * Starts a local LiteLLM proxy that translates Anthropic API requests into
 * OpenRouter-compatible chat completions.
 */
export async function configureOpenRouterEnvironment(): Promise<void> {
  if (proxyInitialized) {
    return;
  }

  if (process.env.CLAUDE_CODE_USE_OPENROUTER !== "1") {
    return;
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    console.warn(
      "CLAUDE_CODE_USE_OPENROUTER is set but OPENROUTER_API_KEY is missing",
    );
    return;
  }

  const remoteBaseUrl =
    process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_REMOTE_BASE_URL;

  if (process.env.CLAUDE_CODE_OPENROUTER_DISABLE_PROXY === "1") {
    if (!process.env.ANTHROPIC_API_KEY) {
      process.env.ANTHROPIC_API_KEY = openRouterKey;
    }

    const headers = parseHeaderLines(process.env.ANTHROPIC_CUSTOM_HEADERS);
    setHeader(headers, "Authorization", `Bearer ${openRouterKey}`);

    const referer = process.env.OPENROUTER_SITE_URL?.trim();
    if (referer) {
      setHeader(headers, "HTTP-Referer", referer);
    }

    const title = process.env.OPENROUTER_APP_TITLE?.trim();
    if (title) {
      setHeader(headers, "X-Title", title);
    }

    const extraHeaders = parseHeaderLines(process.env.OPENROUTER_EXTRA_HEADERS);
    for (const [key, entry] of extraHeaders.entries()) {
      headers.set(key, entry);
    }

    process.env.ANTHROPIC_CUSTOM_HEADERS = serializeHeaders(headers);
    process.env.ANTHROPIC_BASE_URL = remoteBaseUrl;
    proxyInitialized = true;
    return;
  }

  const preferredModel =
    process.env.ANTHROPIC_MODEL?.trim() ||
    extractModelFromClaudeArgs(process.env.INPUT_CLAUDE_ARGS);

  const additionalModels = parseAdditionalModels(
    process.env.OPENROUTER_ADDITIONAL_MODELS,
  );

  const proxy = await startOpenRouterProxy({
    apiKey: openRouterKey,
    baseUrl: remoteBaseUrl,
    siteUrl: process.env.OPENROUTER_SITE_URL,
    appTitle: process.env.OPENROUTER_APP_TITLE,
    extraHeaders: process.env.OPENROUTER_EXTRA_HEADERS,
    preferredModel,
    additionalModels,
  });

  process.env.ANTHROPIC_BASE_URL = proxy.baseUrl;
  process.env.ANTHROPIC_API_KEY = proxy.masterKey;
  delete process.env.ANTHROPIC_CUSTOM_HEADERS;

  registerCleanup(proxy.stop);

  proxyInitialized = true;
}
