import { describe, it, expect } from 'vitest';
import { resolveServer } from '../src/ServerResolver.js';

describe('resolveServer', () => {
    it('resolves a low-level Server with setRequestHandler', () => {
        const server = { setRequestHandler: () => {} };
        expect(resolveServer(server)).toBe(server);
    });

    it('resolves the inner Server from McpServer wrapper', () => {
        const inner = { setRequestHandler: () => {} };
        const mcpServer = { server: inner };
        expect(resolveServer(mcpServer)).toBe(inner);
    });

    it('throws on null', () => {
        expect(() => resolveServer(null)).toThrow('received null');
    });

    it('throws on undefined', () => {
        expect(() => resolveServer(undefined)).toThrow('received undefined');
    });

    it('throws on string', () => {
        expect(() => resolveServer('not-a-server')).toThrow('received string');
    });

    it('throws on object without setRequestHandler', () => {
        expect(() => resolveServer({})).toThrow('does not have setRequestHandler');
    });

    it('throws on object with non-function setRequestHandler', () => {
        expect(() => resolveServer({ setRequestHandler: 42 }))
            .toThrow('does not have setRequestHandler');
    });
});
