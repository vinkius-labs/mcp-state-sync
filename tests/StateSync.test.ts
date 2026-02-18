import { describe, it, expect, vi } from 'vitest';
import { StateSync } from '../src/StateSync.js';
import type { McpToolDef, McpCallResult } from '../src/types.js';
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// ── Mock MCP Server ─────────────────────────────────────────────────

function createMockServer() {
    const handlers = new Map<unknown, (...args: unknown[]) => unknown>();
    return {
        setRequestHandler(schema: unknown, handler: (...args: unknown[]) => unknown) {
            handlers.set(schema, handler);
        },
        getHandler(schema: unknown) {
            return handlers.get(schema);
        },
    };
}

// ── Mock Fusion Registry ─────────────────────────────────────────────

function createMockRegistry(tools: McpToolDef[], callResult: McpCallResult) {
    return {
        getAllTools: () => tools,
        getTools: (_filter: Record<string, unknown>) => tools,
        routeCall: vi.fn().mockResolvedValue(callResult),
    };
}

// ── Test Tools ──────────────────────────────────────────────────────

const sprintGet: McpToolDef = {
    name: 'sprints.get',
    description: 'Get sprint details.',
    inputSchema: { type: 'object' },
};

const sprintUpdate: McpToolDef = {
    name: 'sprints.update',
    description: 'Update a sprint.',
    inputSchema: { type: 'object' },
};

const countriesList: McpToolDef = {
    name: 'countries.list',
    description: 'List all countries.',
    inputSchema: { type: 'object' },
};

// ── Integration Tests ───────────────────────────────────────────────

describe('StateSync — Fusion Mode', () => {
    it('decorates tool descriptions with Cache-Control', () => {
        const server = createMockServer();
        const registry = createMockRegistry(
            [sprintGet, countriesList],
            { content: [] },
        );

        const sync = new StateSync({
            defaults: { cacheControl: 'no-store' },
            policies: [
                { match: 'countries.*', cacheControl: 'immutable' },
            ],
        });
        sync.attachToServer(server, registry);

        const listHandler = server.getHandler(ListToolsRequestSchema)!;
        const result = listHandler();

        expect(result.tools[0].description).toBe(
            'Get sprint details. [Cache-Control: no-store]',
        );
        expect(result.tools[1].description).toBe(
            'List all countries. [Cache-Control: immutable]',
        );
    });

    it('injects System invalidation on successful write', async () => {
        const server = createMockServer();
        const registry = createMockRegistry(
            [sprintGet, sprintUpdate],
            { content: [{ type: 'text', text: '{"ok":true}' }], isError: false },
        );

        const sync = new StateSync({
            policies: [
                { match: 'sprints.update', invalidates: ['sprints.*'] },
            ],
        });
        sync.attachToServer(server, registry);

        const callHandler = server.getHandler(CallToolRequestSchema)!;
        const result = await callHandler(
            { params: { name: 'sprints.update', arguments: { id: 10 } } },
            {},
        );

        expect(result.content).toHaveLength(2);
        expect(result.content[0].text).toBe(
            '[System: Cache invalidated for sprints.* — caused by sprints.update]',
        );
        expect(result.content[1].text).toBe('{"ok":true}');
    });

    it('does NOT inject invalidation on failed write (isError guard)', async () => {
        const server = createMockServer();
        const registry = createMockRegistry(
            [sprintUpdate],
            { content: [{ type: 'text', text: '{"error":"Invalid"}' }], isError: true },
        );

        const sync = new StateSync({
            policies: [
                { match: 'sprints.update', invalidates: ['sprints.*'] },
            ],
        });
        sync.attachToServer(server, registry);

        const callHandler = server.getHandler(CallToolRequestSchema)!;
        const result = await callHandler(
            { params: { name: 'sprints.update', arguments: {} } },
            {},
        );

        expect(result.content).toHaveLength(1);
        expect(result.content[0].text).toBe('{"error":"Invalid"}');
    });

    it('does not inject invalidation for reads', async () => {
        const server = createMockServer();
        const registry = createMockRegistry(
            [sprintGet],
            { content: [{ type: 'text', text: '{"end_date":"Nov 10"}' }] },
        );

        const sync = new StateSync({
            policies: [
                { match: 'sprints.*', cacheControl: 'no-store' },
            ],
        });
        sync.attachToServer(server, registry);

        const callHandler = server.getHandler(CallToolRequestSchema)!;
        const result = await callHandler(
            { params: { name: 'sprints.get', arguments: { id: 10 } } },
            {},
        );

        expect(result.content).toHaveLength(1);
        expect(result.content[0].text).toBe('{"end_date":"Nov 10"}');
    });
});

describe('StateSync — Manual Mode', () => {
    it('works with explicit tool definitions and handler', async () => {
        const server = createMockServer();
        const handler = vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: '{"ok":true}' }],
            isError: false,
        });

        const sync = new StateSync({
            policies: [
                { match: 'update_sprint', cacheControl: 'no-store', invalidates: ['get_sprint'] },
                { match: 'get_sprint', cacheControl: 'no-store' },
            ],
        });
        sync.attachToServer(server, {
            tools: [
                { name: 'get_sprint', description: 'Get sprint.', inputSchema: {} },
                { name: 'update_sprint', description: 'Update sprint.', inputSchema: {} },
            ],
            handler,
        });

        // Verify list
        const listHandler = server.getHandler(ListToolsRequestSchema)!;
        const listResult = listHandler();
        expect(listResult.tools[0].description).toBe('Get sprint. [Cache-Control: no-store]');

        // Verify write invalidation
        const callHandler = server.getHandler(CallToolRequestSchema)!;
        const callResult = await callHandler(
            { params: { name: 'update_sprint', arguments: {} } },
            {},
        );
        expect(callResult.content[0].text).toBe(
            '[System: Cache invalidated for get_sprint — caused by update_sprint]',
        );
    });
});

describe('StateSync — McpServer wrapper resolution', () => {
    it('resolves low-level Server from McpServer wrapper', () => {
        const innerServer = createMockServer();
        const mcpServer = { server: innerServer };

        const sync = new StateSync({
            policies: [{ match: '**', cacheControl: 'no-store' }],
        });

        const registry = createMockRegistry(
            [sprintGet],
            { content: [] },
        );

        expect(() => sync.attachToServer(mcpServer, registry)).not.toThrow();

        const listHandler = innerServer.getHandler(ListToolsRequestSchema)!;
        const result = listHandler();
        expect(result.tools[0].description).toContain('[Cache-Control: no-store]');
    });

    it('throws on invalid server object', () => {
        const sync = new StateSync({ policies: [] });
        const registry = createMockRegistry([], { content: [] });

        expect(() => sync.attachToServer(null, registry)).toThrow();
        expect(() => sync.attachToServer({}, registry)).toThrow();
        expect(() => sync.attachToServer('string', registry)).toThrow();
    });
});
