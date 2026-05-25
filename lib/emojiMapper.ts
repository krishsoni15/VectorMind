/**
 * Smart Emoji Mapper for VectorMind AI Output Headings.
 * Context-aware, clean, and highly professional.
 */

export const EMOJI_ENABLED = true

// Priority order mapping: list of keyword lists mapped to emojis.
// We scan keywords from top to bottom. If a heading contains any keyword from the list, we return the emoji.
const KERNEL_MAPPING: { keywords: string[]; emoji: string }[] = [
  { keywords: ['comparison', 'vs', 'difference', 'between'], emoji: '⚖️' },
  { keywords: ['architecture', 'structure', 'overview', 'system'], emoji: '🏗️' },
  { keywords: ['protocol', 'network', 'communication', 'mqtt', 'coap'], emoji: '📡' },
  { keywords: ['security', 'threat', 'vulnerability', 'challenge'], emoji: '🔒' },
  { keywords: ['database', 'vector', 'index', 'search'], emoji: '🗂️' },
  { keywords: ['performance', 'speed', 'latency', 'fast'], emoji: '⚡' },
  { keywords: ['sensor', 'hardware', 'arduino', 'raspberry pi'], emoji: '🔌' },
  { keywords: ['application', 'use case', 'healthcare', 'agriculture'], emoji: '🌱' },
  { keywords: ['cloud', 'deployment', 'server', 'hosting'], emoji: '☁️' },
  { keywords: ['fog', 'edge', 'computing'], emoji: '🌫️' },
  { keywords: ['question', 'exam', 'paper', 'topic'], emoji: '📋' },
  { keywords: ['tip', 'study', 'strategy', 'focus'], emoji: '🎯' },
  { keywords: ['weightage', 'marks', 'distribution', 'score'], emoji: '📊' },
  { keywords: ['memory', 'storage', 'cache'], emoji: '🗄️' },
  { keywords: ['code', 'programming', 'function', 'algorithm'], emoji: '💻' },
  { keywords: ['error', 'issue', 'debug', 'fix'], emoji: '🛠️' },
  { keywords: ['definition', 'concept', 'explain', 'what is'], emoji: '📖' },
  { keywords: ['warning', 'caution', 'note', 'important'], emoji: '⚠️' },
  { keywords: ['list', 'items', 'priority', 'ranked'], emoji: '📝' },
  { keywords: ['summary', 'final', 'answer', 'conclusion'], emoji: '✅' }
]

/**
 * Returns a contextually matched emoji for a section heading.
 * Returns null if disabled or no confident match found.
 */
export function getEmoji(heading: string): string | null {
  if (!EMOJI_ENABLED || !heading) return null

  const normalized = heading.toLowerCase()

  for (const group of KERNEL_MAPPING) {
    for (const keyword of group.keywords) {
      if (normalized.includes(keyword)) {
        return group.emoji
      }
    }
  }

  return null
}
