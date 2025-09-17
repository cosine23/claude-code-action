import { mkdtemp, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { spawn } from "child_process";
import { setTimeout as delay } from "timers/promises";
import { createServer, Server } from "net";

type ProxyHandle = {
  baseUrl: string;
  masterKey: string;
  stop: () => Promise<void>;
};

const DEFAULT_MODELS = [
  "anthropic/claude-sonnet-4",
  "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3.5-haiku",
  "anthropic/claude-3.5-haiku-20241022",
  "anthropic/claude-3.5-sonnet-20241022",
  "anthropic/claude-3-opus-20240229",
];

async function installProxyDependency(): Promise<void> {
  const installArgs = [
    "-m",
    "pip",
    "install",
    "--quiet",
    "litellm[proxy]==1.44.14",
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn("python3", installArgs, {
      stdio: ["ignore", "inherit", "inherit"],
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Failed to install litellm proxy dependencies (exit code ${code})`,
          ),
        );
      }
    });
  });
}

async function getAvailablePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let attempts = 0;
    const tryListen = () => {
      const server: Server = createServer();
      server.listen(0, "127.0.0.1");
      server.on("listening", () => {
        const address = server.address();
        server.close(() => {
          if (typeof address === "object" && address && address.port) {
            resolve(address.port);
          } else {
            reject(new Error("Failed to determine proxy port"));
          }
        });
      });
      server.on("error", (err) => {
        server.close();
        attempts += 1;
        if (attempts > 5) {
          reject(err);
        } else {
          setTimeout(tryListen, 100);
        }
      });
    };

    tryListen();
  });
}

function parseHeaderLines(raw?: string | null): Record<string, string> {
  if (!raw) {
    return {};
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const entries: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && key.trim().length > 0) {
        entries[key.trim()] = value.trim();
      }
    }
    return entries;
  } catch (error) {
    // fall through to line parsing
  }

  const headers: Record<string, string> = {};
  const lines = trimmed.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const name = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!name || !value) continue;
    headers[name] = value;
  }
  return headers;
}

async function waitForProxy(port: number): Promise<void> {
  const maxAttempts = 30;
  const baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // ignore until timeout
    }
    await delay(200);
  }
  throw new Error("Timed out waiting for OpenRouter proxy to become ready");
}

export type OpenRouterProxyOptions = {
  apiKey: string;
  baseUrl: string;
  siteUrl?: string;
  appTitle?: string;
  extraHeaders?: string;
  preferredModel?: string;
  additionalModels?: string[];
};

export async function startOpenRouterProxy(
  options: OpenRouterProxyOptions,
): Promise<ProxyHandle> {
  if (process.env.CLAUDE_CODE_OPENROUTER_DISABLE_PROXY === "1") {
    throw new Error(
      "OpenRouter proxy startup disabled via CLAUDE_CODE_OPENROUTER_DISABLE_PROXY",
    );
  }

  const port = await getAvailablePort();
  const workingDir = await mkdtemp(join(tmpdir(), "litellm-openrouter-"));
  const masterKey = `sk-litellm-proxy-${Math.random().toString(36).slice(2)}`;

  const headerEntries: Record<string, string> = {
    "HTTP-Referer": options.siteUrl?.trim() || "https://github.com/anthropics",
    "X-Title": options.appTitle?.trim() || "Claude Code OpenRouter",
    ...parseHeaderLines(options.extraHeaders),
  };

  const allModels = new Set<string>(DEFAULT_MODELS);
  if (options.preferredModel) {
    allModels.add(options.preferredModel);
  }
  (options.additionalModels || [])
    .map((model) => model.trim())
    .filter((model) => model.length > 0)
    .forEach((model) => allModels.add(model));

  const modelListYaml = Array.from(allModels)
    .map((model) => {
      const headerEntriesArray = Object.entries(headerEntries);
      const headerYaml = headerEntriesArray
        .map(([
          key,
          value,
        ]) => `        ${key}: "${value.replace(/"/g, '\"')}"`)
        .join("\n");

      const extraHeadersSection =
        headerEntriesArray.length > 0
          ? `\n${headerYaml}`
          : " {}";

      return `  - model_name: "${model}"
    litellm_params:
      model: "${model}"
      provider: openrouter
      api_base: "${options.baseUrl}"
      api_key: "${options.apiKey}"
      extra_headers:${extraHeadersSection}`;
    })
    .join("\n");

  const config = `model_list:
${modelListYaml}

general_settings:
  master_key: "${masterKey}"
  stream_timeout: 600
`; // allow up to 10 minutes streaming

  const configPath = join(workingDir, "config.yaml");
  await writeFile(configPath, config, "utf8");

  await installProxyDependency();

  const proxyArgs = [
    "-m",
    "litellm",
    "--config",
    configPath,
    "--port",
    port.toString(),
    "--host",
    "127.0.0.1",
  ];

  const proxyProcess = spawn("python3", proxyArgs, {
    cwd: workingDir,
    env: {
      ...process.env,
      OPENROUTER_API_KEY: options.apiKey,
    },
    stdio: ["ignore", "inherit", "inherit"],
  });

  proxyProcess.on("exit", (code, signal) => {
    if (code !== null && code !== 0) {
      console.error(`OpenRouter proxy exited with code ${code}`);
    }
    if (signal) {
      console.warn(`OpenRouter proxy terminated via signal ${signal}`);
    }
  });

  await waitForProxy(port);

  const stop = async () => {
    proxyProcess.kill("SIGTERM");
  };

  return {
    baseUrl: `http://127.0.0.1:${port}/anthropic`,
    masterKey,
    stop,
  };
}
