/**
 * DescriptionDecorator — Append Cache-Control to Tool Descriptions
 *
 * Pure function. Single responsibility: decorate a tool description
 * with its resolved Cache-Control directive.
 *
 * Idempotent: calling twice on the same tool produces the same result.
 */
import type { McpToolDef, ResolvedPolicy } from './types.js';

/** Regex to detect an existing Cache-Control directive in the description. */
const CACHE_CONTROL_PATTERN = /\s*\[Cache-Control:\s*\w[^\]]*\]$/;

/**
 * Append the Cache-Control directive to a tool's description.
 * Returns a shallow copy with the decorated description.
 * If the policy has no cacheControl, returns the tool unchanged.
 *
 * Idempotent: if the description already ends with a Cache-Control
 * directive, it is replaced (not duplicated).
 *
 * @example
 * decorateDescription(tool, { cacheControl: 'no-store' })
 * // "Manage sprints." → "Manage sprints. [Cache-Control: no-store]"
 */
export function decorateDescription(
    tool: McpToolDef,
    policy: ResolvedPolicy | null,
): McpToolDef {
    if (!policy?.cacheControl) return tool;

    const suffix = ` [Cache-Control: ${policy.cacheControl}]`;
    const base = (tool.description ?? '').replace(CACHE_CONTROL_PATTERN, '');
    const description = base + suffix;

    return { ...tool, description };
}
