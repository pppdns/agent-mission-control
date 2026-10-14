import { describe, expect, it, vi } from "vitest";
import { BudgetTracker } from "@/harness/budget";
import { MODELS, ROUTES } from "@/harness/config";
import { LlmClient } from "@/harness/models";
import { ModelRouter } from "@/harness/router";
import type { CallKind, Provider } from "@/harness/types";
import { LIMITS, testBus } from "./helpers";

const CALL_KINDS: CallKind[] = ["plan", "research", "critique", "verify", "evaluate", "synthesis", "compaction"];
const PROVIDERS: Provider[] = ["openai", "anthropic", "opencode"];

describe("routing config", () => {
  it("points every route at models that exist", () => {
    for (const route of Object.values(ROUTES)) {
      expect(MODELS[route.model], `${route.name} model`).toBeDefined();
      expect(MODELS[route.fallback], `${route.name} fallback`).toBeDefined();
    }
  });

  it("gives every model a known provider", () => {
    for (const spec of Object.values(MODELS)) {
      expect(PROVIDERS).toContain(spec.provider);
    }
  });

  it("resolves each call kind to its model's provider", () => {
    const router = new ModelRouter();
    for (const kind of CALL_KINDS) {
      const decision = router.decide({ kind });
      expect(decision.provider).toBe(MODELS[decision.model].provider);
    }
  });

  it("flags models that reject a forced tool choice", () => {
    expect(MODELS["claude-sonnet-5-5"].supportsForcedToolChoice).toBe(false);
    expect(MODELS["deepseek-v4.1-flash"].supportsForcedToolChoice).toBe(false);
    expect(MODELS["gpt-6.1-sol"].supportsForcedToolChoice).toBeUndefined();
  });
});

describe("per-route overrides", () => {
  it("keeps the defaults when unset", () => {
    expect(ROUTES.complex.model).toBe("gpt-6.1-sol");
    expect(ROUTES.simple.model).toBe("gpt-6-luna");
    expect(ROUTES.critique.fallback).toBe("gpt-6.1-sol");
  });

  it("serves a route from a valid model override", async () => {
    vi.stubEnv("CRITIQUE_MODEL", "grok-4.6");
    vi.resetModules();
    const fresh = await import("@/harness/config");
    expect(fresh.ROUTES.critique.model).toBe("grok-4.6");
    expect(fresh.MODELS[fresh.ROUTES.critique.model].provider).toBe("opencode");
    vi.unstubAllEnvs();
  });

  it("uses a valid fallback override", async () => {
    vi.stubEnv("SIMPLE_FALLBACK_MODEL", "deepseek-v4-pro");
    vi.resetModules();
    const fresh = await import("@/harness/config");
    expect(fresh.ROUTES.simple.fallback).toBe("deepseek-v4-pro");
    vi.unstubAllEnvs();
  });

  it("ignores unknown overrides", async () => {
    vi.stubEnv("SIMPLE_MODEL", "not-a-model");
    vi.resetModules();
    const fresh = await import("@/harness/config");
    expect(fresh.ROUTES.simple.model).toBe("gpt-6-luna");
    vi.unstubAllEnvs();
  });
});

describe("attempt chain", () => {
  const client = (keys: { openai?: string; anthropic?: string; opencode?: string }) => {
    const { bus } = testBus();
    return new LlmClient(keys, bus, new BudgetTracker({ ...LIMITS }, bus), new ModelRouter(), "test");
  };

  it("fails with a clear error when no provider key is configured", async () => {
    await expect(
      client({}).call({ agentId: "a", kind: "research", purpose: "x", system: "s", messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(/No API key configured for the simple route/);
  });
});
