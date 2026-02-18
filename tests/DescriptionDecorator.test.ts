import { describe, it, expect } from 'vitest';
import { decorateDescription } from '../src/DescriptionDecorator.js';
import type { McpToolDef, ResolvedPolicy } from '../src/types.js';

const baseTool: McpToolDef = {
    name: 'sprints.get',
    description: 'Get sprint details.',
    inputSchema: { type: 'object' },
};

describe('decorateDescription', () => {
    it('appends [Cache-Control: no-store] for volatile tools', () => {
        const policy: ResolvedPolicy = { cacheControl: 'no-store' };
        const result = decorateDescription(baseTool, policy);
        expect(result.description).toBe('Get sprint details. [Cache-Control: no-store]');
    });

    it('appends [Cache-Control: immutable] for static tools', () => {
        const policy: ResolvedPolicy = { cacheControl: 'immutable' };
        const result = decorateDescription(baseTool, policy);
        expect(result.description).toBe('Get sprint details. [Cache-Control: immutable]');
    });

    it('returns tool unchanged when policy is null', () => {
        const result = decorateDescription(baseTool, null);
        expect(result).toBe(baseTool); // Same reference
    });

    it('returns tool unchanged when policy has no cacheControl', () => {
        const policy: ResolvedPolicy = { invalidates: ['sprints.*'] };
        const result = decorateDescription(baseTool, policy);
        expect(result).toBe(baseTool);
    });

    it('does not mutate the original tool', () => {
        const policy: ResolvedPolicy = { cacheControl: 'no-store' };
        decorateDescription(baseTool, policy);
        expect(baseTool.description).toBe('Get sprint details.');
    });

    it('handles tools with undefined description', () => {
        const tool: McpToolDef = { name: 'test', inputSchema: {} };
        const policy: ResolvedPolicy = { cacheControl: 'no-store' };
        const result = decorateDescription(tool, policy);
        expect(result.description).toBe(' [Cache-Control: no-store]');
    });

    // ── Idempotency ─────────────────────────────────────────────────

    it('is idempotent — double decoration does not duplicate suffix', () => {
        const policy: ResolvedPolicy = { cacheControl: 'no-store' };
        const first = decorateDescription(baseTool, policy);
        const second = decorateDescription(first, policy);
        expect(second.description).toBe('Get sprint details. [Cache-Control: no-store]');
    });

    it('replaces existing directive when policy changes', () => {
        const volatile: ResolvedPolicy = { cacheControl: 'no-store' };
        const immutable: ResolvedPolicy = { cacheControl: 'immutable' };
        const first = decorateDescription(baseTool, volatile);
        const second = decorateDescription(first, immutable);
        expect(second.description).toBe('Get sprint details. [Cache-Control: immutable]');
    });
});
