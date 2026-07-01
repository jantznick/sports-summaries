/**
 * Default $/1M token rates for common OpenAI models.
 * Override with OPENAI_INPUT_COST_PER_1M and OPENAI_OUTPUT_COST_PER_1M in .env.
 * @see https://openai.com/api/pricing/
 */
const MODEL_PRICING = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
};

export function getModelPricing(model, config) {
  if (config.openAiInputCostPer1M != null && config.openAiOutputCostPer1M != null) {
    return {
      input: config.openAiInputCostPer1M,
      output: config.openAiOutputCostPer1M,
    };
  }

  return MODEL_PRICING[model] || { input: 0, output: 0 };
}

export function calculateCost(usage, pricing) {
  const inputTokens = usage?.prompt_tokens || 0;
  const outputTokens = usage?.completion_tokens || 0;
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  return {
    inputTokens,
    outputTokens,
    totalTokens: usage?.total_tokens || inputTokens + outputTokens,
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

export function formatCost(usd) {
  if (usd === 0) {
    return '$0.000000';
  }
  if (usd < 0.0001) {
    return `$${usd.toFixed(6)}`;
  }
  if (usd < 0.01) {
    return `$${usd.toFixed(5)}`;
  }
  return `$${usd.toFixed(4)}`;
}

export function logOpenAiUsage({ label, model, usage, pricing, unknownPricing = false, costTracker }) {
  const cost = calculateCost(usage, pricing);

  const pricingNote = unknownPricing
    ? ' (pricing unknown — set OPENAI_INPUT_COST_PER_1M / OPENAI_OUTPUT_COST_PER_1M)'
    : '';

  console.log(
    `[openai] ${label} | model=${model} | ` +
      `tokens in=${cost.inputTokens} out=${cost.outputTokens} total=${cost.totalTokens} | ` +
      `cost=${formatCost(cost.totalCost)} ` +
      `(in=${formatCost(cost.inputCost)} out=${formatCost(cost.outputCost)})` +
      pricingNote,
  );

  if (costTracker) {
    costTracker.record(cost);
  }

  return cost;
}

export function createCostTracker() {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputCost: 0,
    outputCost: 0,
    totalCost: 0,
    record(cost) {
      this.calls += 1;
      this.inputTokens += cost.inputTokens;
      this.outputTokens += cost.outputTokens;
      this.totalTokens += cost.totalTokens;
      this.inputCost += cost.inputCost;
      this.outputCost += cost.outputCost;
      this.totalCost += cost.totalCost;
    },
    toSummary(model, { mockLlm = false } = {}) {
      return {
        model,
        mockLlm,
        callCount: this.calls,
        inputTokens: this.inputTokens,
        outputTokens: this.outputTokens,
        totalTokens: this.totalTokens,
        inputCost: roundUsd(this.inputCost),
        outputCost: roundUsd(this.outputCost),
        totalCost: roundUsd(this.totalCost),
      };
    },
  };
}

function roundUsd(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function logCostAggregate({ city, date, model, costTracker, mockLlm = false }) {
  const summary = costTracker.toSummary(model, { mockLlm });

  console.log(
    `[openai] TOTAL ${city}/${date} | model=${model} | calls=${summary.callCount} | ` +
      `tokens in=${summary.inputTokens} out=${summary.outputTokens} total=${summary.totalTokens} | ` +
      `cost=${formatCost(summary.totalCost)} ` +
      `(in=${formatCost(summary.inputCost)} out=${formatCost(summary.outputCost)})` +
      (mockLlm ? ' | mock=true' : ''),
  );

  return summary;
}
