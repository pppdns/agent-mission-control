import { LARGE_CONTEXT_TOKENS, MODELS, ROUTES, ROUTING_RULES } from "./config";
import type { AgentRole, CallKind, Provider, RouteName, RuleName } from "./types";

export interface RouteDecision {
  rule: RuleName;
  route: RouteName;
  provider: Provider;
  model: string;
  fallback: string;
  reason: string;
  strategy: "auto";
}

const KIND_RULE: Record<CallKind, RuleName> = {
  plan: "complex_planning",
  research: "simple_parallel_research",
  critique: "critique_cross_family",
  verify: "critique_cross_family",
  evaluate: "complex_gap_detection",
  synthesis: "complex_synthesis",
  compaction: "simple_compaction",
};

export const ROLE_KIND: Record<AgentRole, CallKind> = {
  orchestrator: "plan",
  researcher: "research",
  skeptic: "critique",
  evidence_verifier: "verify",
  evaluator: "evaluate",
  editor: "synthesis",
};

/**
 * Explicit, rule-based model routing (strategy "Auto"). Every decision carries the rule that produced it,
 * so the UI can explain why a call went to a given model.
 */
export class ModelRouter {
  decide(req: { kind: CallKind; estimatedInputTokens?: number }): RouteDecision {
    let rule = KIND_RULE[req.kind];
    let route = ROUTING_RULES[rule].route!;
    if (route === "simple" && (req.estimatedInputTokens ?? 0) > LARGE_CONTEXT_TOKENS) {
      rule = "escalate_large_context";
      route = ROUTING_RULES[rule].route!;
    }
    const spec = ROUTES[route];
    return {
      rule,
      route,
      provider: MODELS[spec.model].provider,
      model: spec.model,
      fallback: spec.fallback,
      reason: ROUTING_RULES[rule].reason,
      strategy: "auto",
    };
  }

  /** The default decision for an agent's main work, shown as its model badge. */
  forRole(role: AgentRole): RouteDecision {
    return this.decide({ kind: ROLE_KIND[role] });
  }

  fallback(from: RouteDecision): RouteDecision {
    return {
      ...from,
      rule: "fallback_provider_error",
      provider: MODELS[from.fallback].provider,
      model: from.fallback,
      fallback: from.model,
      reason: `${ROUTING_RULES.fallback_provider_error.reason} ${from.model} → ${from.fallback}.`,
    };
  }
}
