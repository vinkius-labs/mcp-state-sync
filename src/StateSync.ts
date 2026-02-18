/**
 * StateSync — Public Facade
 *
 * The single entry point for the mcp-state-sync package.
 * Constructs internal components from config and delegates to ServerWrapper.
 *
 * Supports two modes:
 * - Fusion mode: `attachToServer(server, registry, options?)`
 * - Manual mode: `attachToServer(server, upstreamConfig)`
 */
import { PolicyEngine } from './PolicyEngine.js';
import { ServerWrapper } from './ServerWrapper.js';
import {
    isRegistry,
    createFusionUpstream,
    createManualUpstream,
} from './UpstreamFactory.js';
import type { RegistryLike, FusionAttachOptions } from './UpstreamFactory.js';
import type { SyncConfig, UpstreamConfig } from './types.js';

export class StateSync {
    private readonly policyEngine: PolicyEngine;

    constructor(config: SyncConfig) {
        this.policyEngine = new PolicyEngine(config.policies, config.defaults);
    }

    /**
     * Attach StateSync to an MCP Server using a Fusion ToolRegistry.
     *
     * StateSync inherits the tool tree from the registry (zero duplication)
     * and decorates descriptions + responses according to policies.
     *
     * @example
     * ```typescript
     * const sync = new StateSync({ policies: [...] });
     * sync.attachToServer(server, registry);
     * ```
     */
    attachToServer(server: unknown, registry: RegistryLike, options?: FusionAttachOptions): void;

    /**
     * Attach StateSync to an MCP Server with manual tool definitions.
     *
     * Use this when not using mcp-fusion. Provide your tool definitions
     * and a handler function directly.
     *
     * @example
     * ```typescript
     * sync.attachToServer(server, {
     *     tools: myToolDefinitions,
     *     handler: async (name, args) => myHandler(name, args),
     * });
     * ```
     */
    attachToServer(server: unknown, upstream: UpstreamConfig): void;

    attachToServer(
        server: unknown,
        source: RegistryLike | UpstreamConfig,
        options?: FusionAttachOptions,
    ): void {
        const upstream = isRegistry(source)
            ? createFusionUpstream(source, options)
            : createManualUpstream(source);

        const wrapper = new ServerWrapper(this.policyEngine);
        wrapper.attach(server, upstream);
    }
}
