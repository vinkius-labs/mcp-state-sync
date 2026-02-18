/**
 * CausalEngine — Write Detection + isError Guard
 *
 * Pure function. Single responsibility: given a tool call result,
 * determine which domain patterns to invalidate.
 *
 * Rules:
 * 1. If the response has `isError: true` → no invalidation (mutation failed)
 * 2. If the policy has `invalidates` → return those patterns
 * 3. Otherwise → no invalidation
 */
import type { ResolvedPolicy } from './types.js';

/**
 * Resolve which domain patterns should be invalidated after a tool call.
 *
 * @returns Array of glob patterns to invalidate, or empty if none.
 */
export function resolveInvalidations(
    policy: ResolvedPolicy | null,
    isError: boolean,
): readonly string[] {
    // Guard: failed mutations don't invalidate
    if (isError) return [];

    return policy?.invalidates ?? [];
}
