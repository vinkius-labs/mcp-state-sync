/**
 * mcp-state-sync — Public API
 *
 * Epistemic cache-control layer for MCP servers.
 * Prevents LLM stale context hallucination via RFC 7234 semantics
 * and coarse-grained causal domain invalidation.
 */

// Main class
export { StateSync } from './StateSync.js';

// Types
export type {
    CacheDirective,
    SyncPolicy,
    SyncConfig,
    ResolvedPolicy,
    McpToolDef,
    McpCallResult,
    Upstream,
    UpstreamConfig,
} from './types.js';

export type { FusionAttachOptions, RegistryLike } from './UpstreamFactory.js';

// Pure functions
export { matchGlob } from './GlobMatcher.js';
export { validatePolicies, validateDefaults, VALID_DIRECTIVES } from './PolicyValidator.js';
export { decorateDescription } from './DescriptionDecorator.js';
export { resolveInvalidations } from './CausalEngine.js';
export { decorateResponse } from './ResponseDecorator.js';
export { isRegistry, createFusionUpstream, createManualUpstream } from './UpstreamFactory.js';

// Infrastructure
export { PolicyEngine } from './PolicyEngine.js';
export { ServerWrapper } from './ServerWrapper.js';
export { resolveServer } from './ServerResolver.js';
export type { McpServerLike } from './ServerResolver.js';
