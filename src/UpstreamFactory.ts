/**
 * UpstreamFactory — Upstream Adapter Creation
 *
 * Single responsibility: create Upstream adapters for both Fusion and Manual modes.
 * Includes duck-type detection for Fusion's ToolRegistry.
 */
import type {
    Upstream,
    UpstreamConfig,
    McpCallResult,
    McpToolDef,
} from './types.js';

// ── Fusion Duck-Typing ──────────────────────────────────────────────

/**
 * Duck-typed interface for mcp-fusion's ToolRegistry.
 * No import from @vinkius-core/mcp-fusion — it's optional.
 */
export interface RegistryLike {
    getAllTools(): McpToolDef[];
    getTools(filter: { tags?: string[]; exclude?: string[] }): McpToolDef[];
    routeCall(ctx: unknown, name: string, args: Record<string, unknown>): Promise<McpCallResult>;
}

/** Options for Fusion-mode attachment (mirrors mcp-fusion's AttachOptions). */
export interface FusionAttachOptions {
    filter?: { tags?: string[]; exclude?: string[] };
    contextFactory?: (extra: unknown) => unknown;
}

// ── Factory Functions ───────────────────────────────────────────────

/**
 * Create an Upstream adapter from a Fusion ToolRegistry.
 * StateSync inherits the tool tree from the registry (zero duplication).
 */
export function createFusionUpstream(
    registry: RegistryLike,
    options?: FusionAttachOptions,
): Upstream {
    const { filter, contextFactory } = options ?? {};

    return {
        listTools: () => ({
            tools: filter ? registry.getTools(filter) : registry.getAllTools(),
        }),
        callTool: async (name, args, extra) => {
            const ctx = contextFactory ? contextFactory(extra) : undefined;
            return registry.routeCall(ctx, name, args);
        },
    };
}

/**
 * Create an Upstream adapter from manual tool definitions + handler.
 */
export function createManualUpstream(config: UpstreamConfig): Upstream {
    const tools = [...config.tools] as McpToolDef[];

    return {
        listTools: () => ({ tools }),
        callTool: (name, args, extra) => config.handler(name, args, extra),
    };
}

// ── Duck-Type Detection ─────────────────────────────────────────────

/**
 * Detect whether the source is a Fusion ToolRegistry (duck-typed).
 * Checks for `getAllTools` and `routeCall` methods.
 */
export function isRegistry(source: unknown): source is RegistryLike {
    if (!source || typeof source !== 'object') return false;
    const s = source as Record<string, unknown>;
    return typeof s.getAllTools === 'function'
        && typeof s.routeCall === 'function';
}
