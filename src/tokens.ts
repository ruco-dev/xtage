/**
 * Token counting using @anthropic-ai/tokenizer.
 * Accurate enough for Claude 2 family; used as a conservative approximation for Claude 3+.
 * The Counter type is compatible with chunker.ts.
 */
import { countTokens } from '@anthropic-ai/tokenizer'

export function countTokensLocal(text: string): number {
  try {
    return countTokens(text)
  } catch {
    // Fallback: chars/4 approximation
    return Math.ceil(text.length / 4)
  }
}
