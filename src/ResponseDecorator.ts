/**
 * ResponseDecorator — Prepend System Invalidation Content Block
 *
 * Pure function. Single responsibility: prepend a `[System: ...]`
 * content block to a call result. Goes at index 0 to survive truncation.
 */
import type { McpCallResult } from './types.js';

/**
 * Prepend a System invalidation content block to the call result.
 * The system block goes FIRST (index 0) so it survives response truncation.
 * The developer's original content blocks are untouched.
 *
 * @param result    - Original call result (developer's response)
 * @param patterns  - Domain patterns that were invalidated (e.g. ['sprints.*'])
 * @param causedBy  - The tool name that caused the invalidation
 * @returns A new result with the System block prepended
 */
export function decorateResponse(
    result: McpCallResult,
    patterns: readonly string[],
    causedBy: string,
): McpCallResult {
    const domains = patterns.join(', ');
    const systemBlock = {
        type: 'text' as const,
        text: `[System: Cache invalidated for ${domains} — caused by ${causedBy}]`,
    };

    return {
        ...result,
        content: [systemBlock, ...result.content],
    };
}
