#!/usr/bin/env bun

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { configureOpenRouterEnvironment } from "../src/openrouter";

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
}

describe("configureOpenRouterEnvironment", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetOpenRouterEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("configures default base URL and headers", () => {
    process.env.CLAUDE_CODE_USE_OPENROUTER = "1";
    process.env.OPENROUTER_API_KEY = "test-key";

    configureOpenRouterEnvironment();

    expect(process.env.ANTHROPIC_BASE_URL).toBe("https://openrouter.ai/api");
    expect(process.env.ANTHROPIC_API_KEY).toBe("test-key");
    expect(process.env.ANTHROPIC_CUSTOM_HEADERS).toContain(
      "Authorization: Bearer test-key",
    );
  });

  test("merges existing custom headers without duplicates", () => {
    process.env.CLAUDE_CODE_USE_OPENROUTER = "1";
    process.env.OPENROUTER_API_KEY = "abc123";
    process.env.ANTHROPIC_CUSTOM_HEADERS = "X-Test: Value";

    configureOpenRouterEnvironment();

    expect(process.env.ANTHROPIC_CUSTOM_HEADERS?.split("\n")).toEqual([
      "X-Test: Value",
      "Authorization: Bearer abc123",
    ]);
  });

  test("supports JSON formatted custom headers", () => {
    process.env.CLAUDE_CODE_USE_OPENROUTER = "1";
    process.env.OPENROUTER_API_KEY = "json-key";
    process.env.ANTHROPIC_CUSTOM_HEADERS = '{"X-Test":"Value"}';

    configureOpenRouterEnvironment();

    expect(process.env.ANTHROPIC_CUSTOM_HEADERS?.split("\n")).toEqual([
      "X-Test: Value",
      "Authorization: Bearer json-key",
    ]);
  });

  test("applies referer, title, and extra headers", () => {
    process.env.CLAUDE_CODE_USE_OPENROUTER = "1";
    process.env.OPENROUTER_API_KEY = "open-key";
    process.env.OPENROUTER_SITE_URL = "https://example.com";
    process.env.OPENROUTER_APP_TITLE = "Example App";
    process.env.OPENROUTER_EXTRA_HEADERS = "X-Custom: One\nAuthorization: Bearer override";

    configureOpenRouterEnvironment();

    const headerLines = process.env.ANTHROPIC_CUSTOM_HEADERS?.split("\n");
    expect(headerLines).toEqual([
      "Authorization: Bearer override",
      "HTTP-Referer: https://example.com",
      "X-Title: Example App",
      "X-Custom: One",
    ]);
  });

  test("skips configuration when OpenRouter flag is disabled", () => {
    process.env.OPENROUTER_API_KEY = "unused";

    configureOpenRouterEnvironment();

    expect(process.env.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(process.env.ANTHROPIC_CUSTOM_HEADERS).toBeUndefined();
  });
});
