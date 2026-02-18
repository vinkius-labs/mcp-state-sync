/**
 * ServerWrapper — MCP Server Interception (Dual Mode)
 *
 * Intercepts `tools/list` and `tools/call` handlers on the MCP Server.
 * Delegates to an Upstream (Fusion registry or manual handlers).
 *
 * Responsibilities:
 * - tools/list: decorates descriptions via PolicyEngine + DescriptionDecorator
 * - tools/call: delegates to upstream, then applies CausalEngine + ResponseDecorator
 */
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { PolicyEngine } from './PolicyEngine.js';
import type { Upstream, McpCallResult } from './types.js';
import { resolveServer } from './ServerResolver.js';
import { decorateDescription } from './DescriptionDecorator.js';
import { resolveInvalidations } from './CausalEngine.js';
import { decorateResponse } from './ResponseDecorator.js';

// ── Request Shape ───────────────────────────────────────────────────

/** Typed shape of a tools/call request.params (from MCP protocol). */
interface CallToolParams {
    readonly params: {
        readonly name: string;
        readonly arguments?: Record<string, unknown>;
    };
}

// ── ServerWrapper ───────────────────────────────────────────────────

export class ServerWrapper {
    private readonly policyEngine: PolicyEngine;

    constructor(policyEngine: PolicyEngine) {
        this.policyEngine = policyEngine;
    }

    /**
     * Attach StateSync to an MCP Server, delegating to the given Upstream.
     * Registers `tools/list` and `tools/call` handlers that decorate
     * descriptions and responses according to resolved policies.
     */
    attach(server: unknown, upstream: Upstream): void {
        const resolved = resolveServer(server);

        resolved.setRequestHandler(ListToolsRequestSchema, () => {
            const { tools } = upstream.listTools();
            return {
                tools: tools.map(tool =>
                    decorateDescription(tool, this.policyEngine.resolve(tool.name)),
                ),
            };
        });

        resolved.setRequestHandler(CallToolRequestSchema, async (request: unknown, extra: unknown) => {
            const { params } = request as CallToolParams;
            const { name, arguments: args = {} } = params;

            const result: McpCallResult = await upstream.callTool(name, args, extra);

            const policy = this.policyEngine.resolve(name);
            const invalidations = resolveInvalidations(policy, result.isError ?? false);

            if (invalidations.length > 0) {
                return decorateResponse(result, invalidations, name);
            }

            return result;
        });
    }
}
