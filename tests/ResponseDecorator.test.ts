import { describe, it, expect } from 'vitest';
import { decorateResponse } from '../src/ResponseDecorator.js';
import type { McpCallResult } from '../src/types.js';

describe('decorateResponse', () => {
    const baseResult: McpCallResult = {
        content: [{ type: 'text', text: '{"ok":true}' }],
    };

    it('prepends System block at index 0', () => {
        const result = decorateResponse(baseResult, ['sprints.*'], 'sprints.update');

        expect(result.content).toHaveLength(2);
        expect(result.content[0]).toEqual({
            type: 'text',
            text: '[System: Cache invalidated for sprints.* — caused by sprints.update]',
        });
        expect(result.content[1]).toEqual(baseResult.content[0]);
    });

    it('handles multiple invalidation patterns', () => {
        const result = decorateResponse(
            baseResult,
            ['tasks.*', 'sprints.*', 'dashboard.*'],
            'tasks.update',
        );

        expect(result.content[0]).toEqual({
            type: 'text',
            text: '[System: Cache invalidated for tasks.*, sprints.*, dashboard.* — caused by tasks.update]',
        });
    });

    it('preserves all original content blocks', () => {
        const multi: McpCallResult = {
            content: [
                { type: 'text', text: 'block1' },
                { type: 'text', text: 'block2' },
                { type: 'image', data: 'abc', mimeType: 'image/png' },
            ],
        };
        const result = decorateResponse(multi, ['x.*'], 'x.update');

        expect(result.content).toHaveLength(4);
        expect(result.content[0].type).toBe('text');
        expect(result.content.slice(1)).toEqual(multi.content);
    });

    it('does not mutate the original result', () => {
        decorateResponse(baseResult, ['sprints.*'], 'sprints.update');
        expect(baseResult.content).toHaveLength(1);
    });

    it('preserves isError flag', () => {
        const errorResult: McpCallResult = {
            content: [{ type: 'text', text: 'error' }],
            isError: false,
        };
        const result = decorateResponse(errorResult, ['sprints.*'], 'sprints.update');
        expect(result.isError).toBe(false);
    });
});
