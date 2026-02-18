import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../src/PolicyEngine.js';

describe('PolicyEngine', () => {
    it('resolves first matching policy (first-match-wins)', () => {
        const engine = new PolicyEngine([
            { match: 'sprints.get', cacheControl: 'immutable' },
            { match: 'sprints.*', cacheControl: 'no-store' },
        ]);

        const result = engine.resolve('sprints.get');
        expect(result?.cacheControl).toBe('immutable');
    });

    it('resolves broader patterns when specific does not match', () => {
        const engine = new PolicyEngine([
            { match: 'sprints.get', cacheControl: 'immutable' },
            { match: 'sprints.*', cacheControl: 'no-store' },
        ]);

        const result = engine.resolve('sprints.update');
        expect(result?.cacheControl).toBe('no-store');
    });

    it('falls back to defaults when no policy matches', () => {
        const engine = new PolicyEngine(
            [{ match: 'sprints.*', cacheControl: 'no-store' }],
            { cacheControl: 'immutable' },
        );

        const result = engine.resolve('tasks.get');
        expect(result?.cacheControl).toBe('immutable');
    });

    it('returns null when no policy matches and no defaults', () => {
        const engine = new PolicyEngine([
            { match: 'sprints.*', cacheControl: 'no-store' },
        ]);

        expect(engine.resolve('tasks.get')).toBeNull();
    });

    it('resolves invalidates from policy', () => {
        const engine = new PolicyEngine([
            { match: 'sprints.update', invalidates: ['sprints.*'] },
        ]);

        const result = engine.resolve('sprints.update');
        expect(result?.invalidates).toEqual(['sprints.*']);
    });

    it('uses default cacheControl when policy omits it', () => {
        const engine = new PolicyEngine(
            [{ match: 'sprints.update', invalidates: ['sprints.*'] }],
            { cacheControl: 'no-store' },
        );

        const result = engine.resolve('sprints.update');
        expect(result?.cacheControl).toBe('no-store');
        expect(result?.invalidates).toEqual(['sprints.*']);
    });

    it('returns null for policy with no cacheControl and no invalidates', () => {
        const engine = new PolicyEngine([
            { match: 'sprints.*' },
        ]);

        expect(engine.resolve('sprints.get')).toBeNull();
    });

    // ── Resolution Caching ──────────────────────────────────────────

    it('returns the same object on repeated calls (cache hit)', () => {
        const engine = new PolicyEngine([
            { match: 'sprints.*', cacheControl: 'no-store' },
        ]);

        const first = engine.resolve('sprints.get');
        const second = engine.resolve('sprints.get');
        expect(first).toBe(second); // Same reference
    });

    // ── Resolved Policy Immutability ────────────────────────────────

    it('returns frozen resolved policies', () => {
        const engine = new PolicyEngine([
            { match: 'sprints.update', cacheControl: 'no-store', invalidates: ['sprints.*'] },
        ]);

        const result = engine.resolve('sprints.update');
        expect(Object.isFrozen(result)).toBe(true);
        expect(Object.isFrozen(result?.invalidates)).toBe(true);
    });
});
