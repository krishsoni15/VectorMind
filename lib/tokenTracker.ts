export type ModelProvider = 'groq' | 'gemini' | 'cohere' | 'openai';

export interface UsageStats {
  requests: number;
  tokens: number;
}

export interface DailyUsage {
  date: string;
  groq: UsageStats;
  gemini: UsageStats;
  cohere: UsageStats;
  openai: UsageStats;
}

export const FREE_TIER_LIMITS = {
  groq: {
    maxRequestsPerDay: 1000,
    maxTokensPerDay: 100000,
    costPerMillion: 0.59
  },
  gemini: {
    maxRequestsPerDay: 1500,
    maxTokensPerDay: 1000000,
    costPerMillion: 0.075
  },
  cohere: {
    maxRequestsPerDay: 1000,
    maxTokensPerDay: 500000, 
    costPerMillion: 0.15
  },
  openai: {
    maxRequestsPerDay: 500,
    maxTokensPerDay: 200000,
    costPerMillion: 0.15 
  }
};

const STORAGE_KEY = 'vectormind_token_usage';

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

function getDefaultUsage(): DailyUsage {
  return {
    date: getTodayString(),
    groq: { requests: 0, tokens: 0 },
    gemini: { requests: 0, tokens: 0 },
    cohere: { requests: 0, tokens: 0 },
    openai: { requests: 0, tokens: 0 }
  };
}

export function trackUsage(model: ModelProvider, inputTokens: number, outputTokens: number) {
  if (typeof window === 'undefined') return;
  
  const today = getTodayString();
  const raw = localStorage.getItem(STORAGE_KEY);
  let usage = raw ? JSON.parse(raw) as DailyUsage : getDefaultUsage();
  
  // Auto-reset at midnight
  if (usage.date !== today) {
    usage = getDefaultUsage();
  }
  
  // Make sure model structure exists (e.g. for openai backwards compat)
  if (!usage[model]) {
    usage[model] = { requests: 0, tokens: 0 };
  }

  usage[model].requests += 1;
  usage[model].tokens += (inputTokens + outputTokens);
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
  
  // Dispatch event for UI updates globally
  window.dispatchEvent(new Event('token-usage-updated'));
}

export function getUsageStats(): DailyUsage {
  if (typeof window === 'undefined') return getDefaultUsage();
  
  const today = getTodayString();
  const raw = localStorage.getItem(STORAGE_KEY);
  let usage = raw ? JSON.parse(raw) as DailyUsage : getDefaultUsage();
  
  if (usage.date !== today) {
    usage = getDefaultUsage();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
  }
  
  return usage;
}

export function getLimitPercentages(model: ModelProvider, usage: DailyUsage) {
  const stats = usage[model] || { requests: 0, tokens: 0 };
  const limits = FREE_TIER_LIMITS[model];
  
  const reqPct = Math.min(100, (stats.requests / limits.maxRequestsPerDay) * 100);
  const tokPct = Math.min(100, (stats.tokens / limits.maxTokensPerDay) * 100);
  
  return { reqPct, tokPct };
}

export function isNearLimit(model: ModelProvider): boolean {
  const usage = getUsageStats();
  const { reqPct, tokPct } = getLimitPercentages(model, usage);
  return reqPct > 80 || tokPct > 80;
}

export function resetUsage() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getDefaultUsage()));
  window.dispatchEvent(new Event('token-usage-updated'));
}
