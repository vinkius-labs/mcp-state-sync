/**
 * mcp-state-sync — Public Types
 *
 * Minimal type surface. Binary cache vocabulary (no-store | immutable).
 * No max-age — LLMs have no clock.
 */

// ── Cache Directives ────────────────────────────────────────────────

/** Binary cache directive. LLMs have no clock — max-age is impossible. */
export type CacheDirective = 'no-store' | 'immutable';

// ── Policy ──────────────────────────────────────────────────────────

/** A single StateSync policy rule, matched by glob pattern. */
export interface SyncPolicy {
    /** Glob pattern to match tool names. Examples: `"sprints.*"`, `"tasks.update"`, `"**"` */
    readonly match: string;
    /** Cache directive to apply to matching tools' descriptions. */
    readonly cacheControl?: CacheDirective;
    /** For write tools: glob patterns of tools whose cache is invalidated on success. */
    readonly invalidates?: readonly string[];
}

/** StateSync configuration. */
export interface SyncConfig {
    /** Policy rules, evaluated in declaration order (first match wins). */
    readonly policies: readonly SyncPolicy[];
    /** Defaults applied when no policy matches a tool. */
    readonly defaults?: {
        readonly cacheControl?: CacheDirective;
    };
}

// ── Resolved Policy (internal output of PolicyEngine) ───────────────

/** Result of resolving a policy for a specific tool name. */
export interface ResolvedPolicy {
    readonly cacheControl?: CacheDirective;
    readonly invalidates?: readonly string[];
}

// ── MCP Protocol Types (duck-typed, no hard SDK dependency) ─────────

/** Minimal MCP tool definition (duck-typed from @modelcontextprotocol/sdk). */
export interface McpToolDef {
    readonly name: string;
    description?: string;
    readonly inputSchema: Record<string, unknown>;
    readonly annotations?: Record<string, unknown>;
}

/** Minimal MCP call result (duck-typed from @modelcontextprotocol/sdk). */
export interface McpCallResult {
    content: Array<{ type: string;[key: string]: unknown }>;
    isError?: boolean;
}

// ── Upstream (abstraction over Fusion / manual handlers) ────────────

/**
 * Upstream tool provider. Abstracts both Fusion ToolRegistry and manual handlers.
 * ServerWrapper delegates to this without knowing the upstream implementation.
 */
export interface Upstream {
    listTools(): { tools: McpToolDef[] };
    callTool(name: string, args: Record<string, unknown>, extra: unknown): Promise<McpCallResult>;
}

/** Manual upstream configuration (for use without Fusion). */
export interface UpstreamConfig {
    /** MCP tool definitions. */
    readonly tools: readonly McpToolDef[];
    /** Handler invoked for every tools/call request. */
    readonly handler: (
        name: string,
        args: Record<string, unknown>,
        extra: unknown,
    ) => Promise<McpCallResult>;
}
