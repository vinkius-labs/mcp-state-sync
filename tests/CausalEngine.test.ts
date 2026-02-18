import { describe, it, expect } from 'vitest';
import { resolveInvalidations } from '../src/CausalEngine.js';
import type { ResolvedPolicy } from '../src/types.js';

describe('resolveInvalidations', () => {
    it('returns invalidation patterns on successful write', () => {
        const policy: ResolvedPolicy = {
            cacheControl: 'no-store',
            invalidates: ['sprints.*'],
        };
        expect(resolveInvalidations(policy, false)).toEqual(['sprints.*']);
    });

    it('returns empty on failed write (isError guard)', () => {
        const policy: ResolvedPolicy = {
            cacheControl: 'no-store',
            invalidates: ['sprints.*'],
        };
        expect(resolveInvalidations(policy, true)).toEqual([]);
    });

    it('returns empty when policy has no invalidates', () => {
        const policy: ResolvedPolicy = { cacheControl: 'no-store' };
        expect(resolveInvalidations(policy, false)).toEqual([]);
    });

    it('returns empty when policy is null', () => {
        expect(resolveInvalidations(null, false)).toEqual([]);
    });

    it('returns multiple invalidation patterns', () => {
        const policy: ResolvedPolicy = {
            invalidates: ['tasks.*', 'sprints.*', 'dashboard.*'],
        };
        expect(resolveInvalidations(policy, false)).toEqual([
            'tasks.*', 'sprints.*', 'dashboard.*',
        ]);
    });

    it('blocks invalidation even with multiple patterns when isError', () => {
        const policy: ResolvedPolicy = {
            invalidates: ['tasks.*', 'sprints.*'],
        };
        expect(resolveInvalidations(policy, true)).toEqual([]);
    });
});
