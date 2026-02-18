/**
 * ServerResolver — MCP Server Duck-Type Resolution
 *
 * Resolves the low-level `Server` from either `Server` or `McpServer`.
 * Extracted as a shared utility to follow SRP and avoid duplication
 * with mcp-fusion's equivalent logic.
 */

/** Duck-typed interface for the low-level MCP Server. */
export interface McpServerLike {
    setRequestHandler(schema: unknown, handler: (...args: unknown[]) => unknown): void;
}

/**
 * Resolve the low-level Server from either `Server` or `McpServer`.
 *
 * - `McpServer` wraps a `Server` at `.server`
 * - `Server` has `setRequestHandler` directly
 *
 * @throws Error if the provided object is not a valid MCP server
 */
export function resolveServer(server: unknown): McpServerLike {
    if (!server || typeof server !== 'object') {
        throw new Error(
            'StateSync: expected a Server or McpServer instance, ' +
            `received ${server === null ? 'null' : typeof server}.`,
        );
    }

    // McpServer wraps a Server at `.server`
    const candidate = server as Record<string, unknown>;
    if (
        'server' in candidate &&
        candidate.server &&
        typeof candidate.server === 'object' &&
        typeof (candidate.server as Record<string, unknown>).setRequestHandler === 'function'
    ) {
        return candidate.server as McpServerLike;
    }

    // Low-level Server has setRequestHandler directly
    if (typeof (server as Record<string, unknown>).setRequestHandler === 'function') {
        return server as McpServerLike;
    }

    throw new Error(
        'StateSync: the provided object does not have setRequestHandler(). ' +
        'Expected a Server or McpServer instance from @modelcontextprotocol/sdk.',
    );
}
