import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../src/PolicyEngine.js';

describe('PolicyValidator (via PolicyEngine construction)', () => {
    it('throws on empty match pattern', () => {
        expect(() => new PolicyEngine([{ match: '' }]))
            .toThrow("'match' must be a non-empty string");
    });

    it('throws on invalid segment characters', () => {
        expect(() => new PolicyEngine([{ match: 'sprints.@invalid' }]))
            .toThrow('invalid segment "@invalid"');
    });

    it('throws on invalid cacheControl value', () => {
        expect(() => new PolicyEngine([
            { match: 'sprints.*', cacheControl: 'max-age=300' as any },
        ])).toThrow('invalid cacheControl "max-age=300"');
    });

    it('throws on non-array invalidates', () => {
        expect(() => new PolicyEngine([
            { match: 'sprints.update', invalidates: 'sprints.*' as any },
        ])).toThrow("'invalidates' must be an array");
    });

    it('throws on empty string in invalidates', () => {
        expect(() => new PolicyEngine([
            { match: 'sprints.update', invalidates: [''] },
        ])).toThrow('must be non-empty strings');
    });

    it('throws on invalid default cacheControl', () => {
        expect(() => new PolicyEngine(
            [],
            { cacheControl: 'max-age=60' as any },
        )).toThrow('Default cacheControl "max-age=60" is invalid');
    });

    it('accepts valid policies without throwing', () => {
        expect(() => new PolicyEngine([
            { match: 'sprints.*', cacheControl: 'no-store' },
            { match: 'countries.**', cacheControl: 'immutable' },
            { match: 'tasks.update', invalidates: ['tasks.*', 'sprints.*'] },
            { match: '**' },
        ])).not.toThrow();
    });
});
