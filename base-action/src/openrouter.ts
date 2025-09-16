const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

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
      // Fall back to line parsing if JSON parsing fails
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

function serializeHeaders(headers: Map<string, HeaderEntry>): string {
  return Array.from(headers.values())
    .map((entry) => `${entry.name}: ${entry.value}`)
    .join("\n");
}

function setHeader(
  headers: Map<string, HeaderEntry>,
  name: string,
  value: string,
) {
  headers.set(name.toLowerCase(), { name, value });
}

/**
 * Configure Claude Code environment variables for OpenRouter compatibility.
 */
export function configureOpenRouterEnvironment() {
  if (process.env.CLAUDE_CODE_USE_OPENROUTER !== "1") {
    return;
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    // Validation will surface the missing key; nothing to configure.
    return;
  }

  const baseUrl =
    process.env.OPENROUTER_BASE_URL && process.env.OPENROUTER_BASE_URL.trim().length
      ? process.env.OPENROUTER_BASE_URL.trim()
      : DEFAULT_OPENROUTER_BASE_URL;

  process.env.ANTHROPIC_BASE_URL = baseUrl;

  // Ensure the Anthropic key env is set so the Claude CLI continues to launch.
  if (!process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = openRouterKey;
  }

  const headerEntries = parseHeaderLines(process.env.ANTHROPIC_CUSTOM_HEADERS);

  setHeader(headerEntries, "Authorization", `Bearer ${openRouterKey}`);

  const referer = process.env.OPENROUTER_SITE_URL?.trim();
  if (referer) {
    setHeader(headerEntries, "HTTP-Referer", referer);
  }

  const title = process.env.OPENROUTER_APP_TITLE?.trim();
  if (title) {
    setHeader(headerEntries, "X-Title", title);
  }

  const extraHeaders = parseHeaderLines(process.env.OPENROUTER_EXTRA_HEADERS);
  for (const [key, entry] of extraHeaders.entries()) {
    headerEntries.set(key, entry);
  }

  process.env.ANTHROPIC_CUSTOM_HEADERS = serializeHeaders(headerEntries);
}
