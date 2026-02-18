/**
 * PolicyEngine — First-Match-Wins Policy Resolution
 *
 * Single responsibility: resolve a tool name to its applicable policy.
 * Delegates glob matching to GlobMatcher and validation to PolicyValidator.
 *
 * Pure, stateless after construction.
 */
import type { SyncPolicy, ResolvedPolicy, CacheDirective } from './types.js';
import { matchGlob } from './GlobMatcher.js';
import { validatePolicies, validateDefaults } from './PolicyValidator.js';

export class PolicyEngine {
    private readonly policies: readonly SyncPolicy[];
    private readonly defaultCacheControl: CacheDirective | undefined;

    /** Resolution cache: avoids repeated glob iteration for the same tool. */
    private readonly cache = new Map<string, ResolvedPolicy | null>();

    constructor(
        policies: readonly SyncPolicy[],
        defaults?: { readonly cacheControl?: CacheDirective },
    ) {
        validatePolicies(policies);
        validateDefaults(defaults);

        this.policies = Object.freeze([...policies]);
        this.defaultCacheControl = defaults?.cacheControl;
    }

    /**
     * Resolve the applicable policy for a tool name.
     * First matching policy wins. Falls back to defaults.
     * Returns `null` if no policy matches and no defaults are set.
     *
     * Results are cached — repeated calls for the same tool are O(1).
     */
    resolve(toolName: string): ResolvedPolicy | null {
        const cached = this.cache.get(toolName);
        if (cached !== undefined) return cached;

        const result = this.resolveUncached(toolName);
        this.cache.set(toolName, result);
        return result;
    }

    private resolveUncached(toolName: string): ResolvedPolicy | null {
        for (const policy of this.policies) {
            if (matchGlob(policy.match, toolName)) {
                const cacheControl = policy.cacheControl ?? this.defaultCacheControl;
                const invalidates = policy.invalidates?.length
                    ? Object.freeze([...policy.invalidates])
                    : undefined;

                if (!cacheControl && !invalidates) return null;
                return Object.freeze({ cacheControl, invalidates });
            }
        }

        if (this.defaultCacheControl) {
            return Object.freeze({ cacheControl: this.defaultCacheControl });
        }

        return null;
    }
}
