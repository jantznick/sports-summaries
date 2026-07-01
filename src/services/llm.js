import OpenAI from 'openai';
import { getModelPricing, logOpenAiUsage } from '../utils/openai-cost.js';

let client;

function getClient(apiKey) {
  if (!client) {
    client = new OpenAI({ apiKey });
  }
  return client;
}

export async function summarize({ prompt, config, label = 'summary', costTracker }) {
  if (config.mockLlm) {
    console.log(`[openai] ${label} | model=${config.openAiModel} | mock=true | cost=$0.000000`);
    if (costTracker) {
      costTracker.record({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
      });
    }
    return `[mock summary] ${prompt.split('\n')[0]}`;
  }

  if (!config.openAiApiKey) {
    throw new Error('OPENAI_API_KEY is required unless MOCK_LLM=true');
  }

  const openai = getClient(config.openAiApiKey);
  const response = await openai.chat.completions.create({
    model: config.openAiModel,
    messages: [
      {
        role: 'system',
        content:
          'You write concise sports summaries for people who do not follow sports. Be accurate and conversational.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.4,
  });

  const pricing = getModelPricing(config.openAiModel, config);
  const unknownPricing = pricing.input === 0 && pricing.output === 0;
  logOpenAiUsage({
    label,
    model: config.openAiModel,
    usage: response.usage,
    pricing,
    unknownPricing,
    costTracker,
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error('OpenAI returned an empty summary');
  }
  return text;
}
