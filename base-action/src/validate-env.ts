/**
 * Validates the environment variables required for running Claude Code
 * based on the selected provider (Anthropic API, OpenRouter, AWS Bedrock, or Google Vertex AI)
 */
export function validateEnvironmentVariables() {
  const useBedrock = process.env.CLAUDE_CODE_USE_BEDROCK === "1";
  const useVertex = process.env.CLAUDE_CODE_USE_VERTEX === "1";
  const useOpenRouter = process.env.CLAUDE_CODE_USE_OPENROUTER === "1";
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const claudeCodeOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;

  const errors: string[] = [];

  const providerCount = [useBedrock, useVertex, useOpenRouter].filter(Boolean)
    .length;

  if (providerCount > 1) {
    errors.push(
      "Multiple providers configured. Please enable only one of OpenRouter, Bedrock, or Vertex AI.",
    );
  }

  if (useOpenRouter) {
    if (!openRouterApiKey) {
      errors.push(
        "OPENROUTER_API_KEY is required when using the OpenRouter provider.",
      );
    }
  } else if (useBedrock) {
    const requiredBedrockVars = {
      AWS_REGION: process.env.AWS_REGION,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    };

    Object.entries(requiredBedrockVars).forEach(([key, value]) => {
      if (!value) {
        errors.push(`${key} is required when using AWS Bedrock.`);
      }
    });
  } else if (useVertex) {
    const requiredVertexVars = {
      ANTHROPIC_VERTEX_PROJECT_ID: process.env.ANTHROPIC_VERTEX_PROJECT_ID,
      CLOUD_ML_REGION: process.env.CLOUD_ML_REGION,
    };

    Object.entries(requiredVertexVars).forEach(([key, value]) => {
      if (!value) {
        errors.push(`${key} is required when using Google Vertex AI.`);
      }
    });
  } else {
    if (!anthropicApiKey && !claudeCodeOAuthToken) {
      errors.push(
        "Either ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN is required when using direct Anthropic API.",
      );
    }
  }

  if (errors.length > 0) {
    const errorMessage = `Environment variable validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
    throw new Error(errorMessage);
  }
}
