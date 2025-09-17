#!/usr/bin/env bun

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  __resetOpenRouterProxyForTests,
  configureOpenRouterEnvironment,
} from "../src/openrouter";

function resetOpenRouterEnv() {
  delete process.env.CLAUDE_CODE_USE_OPENROUTER;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_BASE_URL;
  delete process.env.OPENROUTER_SITE_URL;
  delete process.env.OPENROUTER_APP_TITLE;
  delete process.env.OPENROUTER_EXTRA_HEADERS;
  delete process.env.ANTHROPIC_BASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_CUSTOM_HEADERS;
  delete process.env.CLAUDE_CODE_OPENROUTER_DISABLE_PROXY;
}

describe("configureOpenRouterEnvironment", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetOpenRouterEnv();
    __resetOpenRouterProxyForTests();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    __resetOpenRouterProxyForTests();
  });

  test("configures default base URL and headers", async () => {
    process.env.CLAUDE_CODE_USE_OPENROUTER = "1";
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.CLAUDE_CODE_OPENROUTER_DISABLE_PROXY = "1";

    await configureOpenRouterEnvironment();

    expect(process.env.ANTHROPIC_BASE_URL).toBe("https://openrouter.ai/api/v1");
    expect(process.env.ANTHROPIC_API_KEY).toBe("test-key");
    expect(process.env.ANTHROPIC_CUSTOM_HEADERS).toContain(
      "Authorization: Bearer test-key",
    );
  });

  test("merges existing custom headers without duplicates", async () => {
    process.env.CLAUDE_CODE_USE_OPENROUTER = "1";
    process.env.OPENROUTER_API_KEY = "abc123";
    process.env.ANTHROPIC_CUSTOM_HEADERS = "X-Test: Value";
    process.env.CLAUDE_CODE_OPENROUTER_DISABLE_PROXY = "1";

    await configureOpenRouterEnvironment();

    const headerString = process.env.ANTHROPIC_CUSTOM_HEADERS || "";
    expect(headerString).toContain("X-Test: Value");
    expect(headerString).toContain("Authorization: Bearer abc123");
  });

  test("supports JSON formatted custom headers", async () => {
    process.env.CLAUDE_CODE_USE_OPENROUTER = "1";
    process.env.OPENROUTER_API_KEY = "json-key";
    process.env.ANTHROPIC_CUSTOM_HEADERS = '{"X-Test":"Value"}';
    process.env.CLAUDE_CODE_OPENROUTER_DISABLE_PROXY = "1";

    await configureOpenRouterEnvironment();

    const headerString = process.env.ANTHROPIC_CUSTOM_HEADERS || "";
    expect(headerString).toContain("X-Test: Value");
    expect(headerString).toContain("Authorization: Bearer json-key");
  });

  test("applies referer, title, and extra headers", async () => {
    process.env.CLAUDE_CODE_USE_OPENROUTER = "1";
    process.env.OPENROUTER_API_KEY = "open-key";
    process.env.OPENROUTER_SITE_URL = "https://example.com";
    process.env.OPENROUTER_APP_TITLE = "Example App";
    process.env.OPENROUTER_EXTRA_HEADERS = "X-Custom: One\nAuthorization: Bearer override";
    process.env.CLAUDE_CODE_OPENROUTER_DISABLE_PROXY = "1";

    await configureOpenRouterEnvironment();

    const headerString = process.env.ANTHROPIC_CUSTOM_HEADERS || "";
    expect(headerString).toContain("Authorization: Bearer override");
    expect(headerString).toContain("HTTP-Referer: https://example.com");
    expect(headerString).toContain("X-Title: Example App");
    expect(headerString).toContain("X-Custom: One");
  });

  test("skips configuration when OpenRouter flag is disabled", async () => {
    process.env.OPENROUTER_API_KEY = "unused";

    await configureOpenRouterEnvironment();

    expect(process.env.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(process.env.ANTHROPIC_CUSTOM_HEADERS).toBeUndefined();
  });
});
