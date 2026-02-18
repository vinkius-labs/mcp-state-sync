/**
 * PolicyValidator — Eager Policy Validation
 *
 * Pure functions. Single responsibility: validate SyncPolicy arrays
 * and default config at construction time (fail-fast).
 */
import type { SyncPolicy, CacheDirective } from './types.js';

// ── Constants ───────────────────────────────────────────────────────

/** Valid cache directives — binary vocab, no max-age. */
export const VALID_DIRECTIVES = new Set<string>(['no-store', 'immutable']);

/** Valid glob segment: alphanumeric, `_`, `-`, `*`, `**`. */
const VALID_SEGMENT = /^(\*{1,2}|[a-zA-Z0-9_-]+)$/;

// ── Validate Policies ───────────────────────────────────────────────

/**
 * Validate an array of policies. Throws on the first invalid entry.
 * Called at PolicyEngine construction time for fail-fast behavior.
 */
export function validatePolicies(policies: readonly SyncPolicy[]): void {
    for (let i = 0; i < policies.length; i++) {
        const p = policies[i];
        const prefix = `Policy[${i}] (match: "${p.match}")`;

        if (!p.match || typeof p.match !== 'string') {
            throw new Error(`${prefix}: 'match' must be a non-empty string.`);
        }

        const segments = p.match.split('.');
        for (const seg of segments) {
            if (!VALID_SEGMENT.test(seg)) {
                throw new Error(
                    `${prefix}: invalid segment "${seg}". ` +
                    `Allowed: alphanumeric, "_", "-", "*", "**".`,
                );
            }
        }

        if (p.cacheControl !== undefined && !VALID_DIRECTIVES.has(p.cacheControl)) {
            throw new Error(
                `${prefix}: invalid cacheControl "${p.cacheControl}". ` +
                `Allowed: "no-store", "immutable".`,
            );
        }

        if (p.invalidates !== undefined) {
            if (!Array.isArray(p.invalidates)) {
                throw new Error(`${prefix}: 'invalidates' must be an array.`);
            }
            for (const pattern of p.invalidates) {
                if (!pattern || typeof pattern !== 'string') {
                    throw new Error(`${prefix}: 'invalidates' entries must be non-empty strings.`);
                }
            }
        }
    }
}

// ── Validate Defaults ───────────────────────────────────────────────

/**
 * Validate the defaults config. Throws if cacheControl is invalid.
 */
export function validateDefaults(
    defaults?: { readonly cacheControl?: CacheDirective },
): void {
    if (defaults?.cacheControl !== undefined && !VALID_DIRECTIVES.has(defaults.cacheControl)) {
        throw new Error(
            `Default cacheControl "${defaults.cacheControl}" is invalid. ` +
            `Allowed: "no-store", "immutable".`,
        );
    }
}
