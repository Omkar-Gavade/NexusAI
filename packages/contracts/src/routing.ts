import { z } from 'zod';
import type { RoutingMode } from './auth.ts';
import { isRoutable, type Availability, type Capabilities } from './models.ts';

export const TaskCategory = z.enum([
  'coding',
  'research',
  'general',
  'summarization',
  'reasoning',
  'quick',
]);
export type TaskCategory = z.infer<typeof TaskCategory>;

export const RoutingDecision = z.object({
  taskCategory: TaskCategory,
  taskLabel: z.string(),
  reason: z.string(),
  selectedModelIds: z.array(z.string()),
  overridden: z.boolean().optional(),
});
export type RoutingDecision = z.infer<typeof RoutingDecision>;

export interface TaskClassification {
  readonly category: TaskCategory;
  readonly label: string;
}

const TASK_LABELS: Record<TaskCategory, string> = {
  coding: 'coding & debugging question',
  research: 'research & evidence-oriented question',
  general: 'general question',
  summarization: 'summarization & document analysis task',
  reasoning: 'reasoning-intensive task',
  quick: 'quick low-latency question',
};

const CODING_PATTERNS = [
  /```/,
  /\b(function|const|let|var|class|interface|type|import|export|async|await|return|def|struct|impl|fn|pub|SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN)\b/,
  /\b(typescript|javascript|python|rust|golang|java|c\+\+|sql|mongodb|react|nextjs|node\.?js|fastify|express|zod|tailwind|css|html|dockerfile|kubernetes|git|regex|graphql|rest api)\b/i,
  /\b(debug|bug|stack\s*trace|exception|segfault|typeerror|referenceerror|syntaxerror|compile|compiler|linter|eslint|refactor|unit test|vitest|jest|playwright|endpoint|middleware|webhook)\b/i,
];

const SUMMARIZATION_PATTERNS = [
  /\b(summarize|summarise|summary|tl;?dr|key takeaways|action items|condense|digest|abstract|exec(utive)? summary|main points|bullet points from)\b/i,
  /\b(analyze this (document|article|transcript|text|report|paper|email|meeting)|extract the key)\b/i,
];

const REASONING_PATTERNS = [
  /\b(prove|proof|theorem|lemma|corollary|deduce|deduction|inductive|contradiction|formal verification|Big-O|time complexity|recurrence relation)\b/i,
  /\b(step[- ]by[- ]step reasoning|logic puzzle|game theory|nash equilibrium|bayesian|probability distribution|combinatorics|differential equation|linear programming|invariant)\b/i,
  /\b(solve this equation|derive the formula|mathematical proof|counterexample)\b/i,
];

const RESEARCH_PATTERNS = [
  /\b(compare and contrast|trade[- ]?offs?|pros and cons|empirical|literature|meta[- ]analysis|peer[- ]reviewed|systematic review|benchmarking|evaluate the evidence)\b/i,
  /\b(architectural trade[- ]?offs?|in[- ]depth analysis|comprehensive comparison|historical context|regulatory implications|market analysis|evaluate the alternatives)\b/i,
];

const QUICK_PATTERNS = [
  /^(what is|what's|who is|who was|when was|where is|define|translate|convert|spell|capital of|how many|how much is)\b/i,
];

/**
 * Lightweight, deterministic task classifier. Runs in <1ms on both server and
 * client without making an extra paid LLM request.
 */
export function classifyTask(prompt: string): TaskClassification {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return { category: 'general', label: TASK_LABELS.general };
  }

  const wordCount = trimmed.split(/\s+/).length;

  // 1. Summarization triggers when explicit summarization intent or long pasted document with summary cues
  let summarizationScore = 0;
  for (const pattern of SUMMARIZATION_PATTERNS) {
    if (pattern.test(trimmed)) summarizationScore += 2;
  }
  if (wordCount > 180 && /\b(text|below|above|following|article|notes|transcript)\b/i.test(trimmed)) {
    summarizationScore += 2;
  }
  if (summarizationScore >= 2) {
    return { category: 'summarization', label: TASK_LABELS.summarization };
  }

  // 2. Coding & technical debugging
  let codingScore = 0;
  for (const pattern of CODING_PATTERNS) {
    if (pattern.test(trimmed)) codingScore += 1;
  }
  if (/[{};()=>]/.test(trimmed) && /\b(error|fix|code|function|return)\b/i.test(trimmed)) {
    codingScore += 1;
  }
  if (codingScore >= 2 || /```/.test(trimmed)) {
    return { category: 'coding', label: TASK_LABELS.coding };
  }

  // 3. Reasoning-intensive tasks
  let reasoningScore = 0;
  for (const pattern of REASONING_PATTERNS) {
    if (pattern.test(trimmed)) reasoningScore += 2;
  }
  if (reasoningScore >= 2) {
    return { category: 'reasoning', label: TASK_LABELS.reasoning };
  }

  // 4. Research & evidence-oriented questions
  let researchScore = 0;
  for (const pattern of RESEARCH_PATTERNS) {
    if (pattern.test(trimmed)) researchScore += 2;
  }
  if (codingScore === 1 && researchScore >= 2) {
    return { category: 'research', label: TASK_LABELS.research };
  }
  if (researchScore >= 2) {
    return { category: 'research', label: TASK_LABELS.research };
  }

  // Single strong coding cue still routes to coding
  if (codingScore === 1) {
    return { category: 'coding', label: TASK_LABELS.coding };
  }

  // 5. Quick low-latency lookups: short, direct factual questions
  if (
    wordCount <= 12 &&
    !trimmed.includes('\n') &&
    (QUICK_PATTERNS.some((p) => p.test(trimmed)) || (wordCount <= 6 && trimmed.endsWith('?')))
  ) {
    return { category: 'quick', label: TASK_LABELS.quick };
  }

  // 6. Default: General knowledge and explanations
  return { category: 'general', label: TASK_LABELS.general };
}

export interface RoutableCandidate {
  readonly id: string;
  readonly displayName: string;
  readonly providerId: string;
  readonly availability: Availability;
  readonly contextWindow: number;
  readonly capabilities: Capabilities;
}

/**
 * Task-specific model affinity weights by catalog ID.
 * Prioritizes verified Gemini (`gemini-flash`) and Groq (`llama-groq`)
 * integrations alongside high-capability reasoning/coding models when routable.
 */
const TASK_MODEL_AFFINITY: Record<TaskCategory, Readonly<Record<string, number>>> = {
  quick: {
    'llama-groq': 100,
    'gemini-flash': 95,
    'gpt-4o': 75,
    'mistral-large': 70,
    'deepseek-chat': 68,
    'claude-sonnet': 65,
  },
  general: {
    'gemini-flash': 98,
    'gpt-4o': 92,
    'claude-sonnet': 90,
    'llama-groq': 86,
    'mistral-large': 80,
    'deepseek-chat': 75,
  },
  summarization: {
    'gemini-flash': 100,
    'claude-sonnet': 94,
    'gpt-4o': 88,
    'mistral-large': 82,
    'llama-groq': 78,
    'deepseek-chat': 72,
  },
  coding: {
    'claude-sonnet': 98,
    'gpt-4o': 95,
    'llama-groq': 94,
    'gemini-flash': 92,
    'deepseek-chat': 90,
    'mistral-large': 80,
  },
  reasoning: {
    'claude-sonnet': 98,
    'gpt-4o': 96,
    'gemini-flash': 91,
    'deepseek-chat': 90,
    'llama-groq': 84,
    'mistral-large': 80,
  },
  research: {
    'gemini-flash': 96,
    'claude-sonnet': 95,
    'gpt-4o': 94,
    'mistral-large': 84,
    'deepseek-chat': 82,
    'llama-groq': 80,
  },
};

export function scoreCandidateForTask(
  candidate: RoutableCandidate,
  category: TaskCategory,
  indexOrder: number,
): number {
  const affinity = TASK_MODEL_AFFINITY[category][candidate.id] ?? Math.max(50 - indexOrder * 2, 10);
  // Prefer verified AVAILABLE providers over unverified UNKNOWN providers
  const availabilityBonus = candidate.availability === 'AVAILABLE' ? 12 : 0;
  // Capability bonuses
  const docBonus =
    category === 'summarization' && candidate.capabilities.documents ? 5 : 0;
  const contextBonus =
    (category === 'summarization' || category === 'research') &&
    candidate.contextWindow >= 200_000
      ? 4
      : 0;
  return affinity + availabilityBonus + docBonus + contextBonus;
}

export function buildRoutingReason(
  _category: TaskCategory,
  label: string,
  selectedModels: readonly { id: string; displayName: string }[],
  routing: RoutingMode,
): string {
  const first = selectedModels[0];
  if (!first) {
    return `No routable models available for this ${label}.`;
  }
  if (selectedModels.length === 1 || routing === 'single') {
    return `Auto-selected ${first.displayName} — suitable for this ${label}.`;
  }
  const names = selectedModels.map((m) => m.displayName).join(', ');
  return `Auto-selected ${names} — suitable for this ${label} (${routing} synthesis).`;
}

/**
 * Client-and-server helper to preview or compute the Smart Router decision
 * from the current list of models and the user's prompt.
 */
export function previewSmartRoute(
  prompt: string,
  routing: RoutingMode,
  candidates: readonly RoutableCandidate[],
  maxModels = 5,
): RoutingDecision {
  const { category, label } = classifyTask(prompt);
  const routable = candidates.filter((m) => isRoutable(m.availability));
  const fanout = routing === 'single' ? 1 : routing === 'balanced' ? 3 : 5;
  const limit = Math.min(fanout, maxModels);

  const scored = routable
    .map((candidate, idx) => ({
      candidate,
      idx,
      score: scoreCandidateForTask(candidate, category, idx),
    }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .slice(0, limit);

  // For multi-model synthesis modes, preserve stable catalog rank order (idx)
  // after picking the top-scoring models, while for single mode pick the #1 match.
  const ordered =
    limit === 1
      ? scored.map((s) => s.candidate)
      : [...scored].sort((a, b) => a.idx - b.idx).map((s) => s.candidate);

  return {
    taskCategory: category,
    taskLabel: label,
    selectedModelIds: ordered.map((m) => m.id),
    reason: buildRoutingReason(category, label, ordered, routing),
  };
}
