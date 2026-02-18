# Changelog

## 0.1.0 (2026-02-18)

Initial public release.

### Core

- **Cache-Control Directives**: `[Cache-Control: no-store | immutable]` appended to tool descriptions in `tools/list`
- **Causal Domain Invalidation**: `[System: Cache invalidated for X — caused by Y]` prepended to write responses
- **Binary Vocabulary**: `no-store` / `immutable` only; no `max-age` (LLMs lack a clock)
- **isError Guard**: Failed mutations never trigger invalidation (database unchanged)
- **Index 0 Positioning**: System blocks survive MCP response truncation
- **Coarse-grained Invalidation**: Domain blast radius forces LLM full resync

### Dual Mode

- **Fusion Mode**: Integrates via duck-typed `ToolRegistry` (zero imports from mcp-fusion)
- **Manual Mode**: Works with explicit `tools` + `handler` definitions

### Architecture

- **PolicyEngine**: First-match-wins resolution with O(1) cached repeat lookups
- **Immutability Guarantees**: All resolved policies are `Object.freeze()`d
- **Idempotent Decoration**: Double-decoration produces the same result (no accumulation)
- **ServerResolver**: Duck-type resolution for Server vs McpServer
- **Fail-fast Validation**: All configs eagerly validated at construction time
- **Zero `any`**: All types are `unknown` where generics are needed
- **SRP Decomposition**: 12 single-responsibility modules with clean delegation

### Tests

- 56 tests across 8 files
- Unit: GlobMatcher, PolicyValidator, PolicyEngine, DescriptionDecorator, CausalEngine, ResponseDecorator, ServerResolver
- Integration: StateSync (Fusion + Manual + McpServer wrapper + error cases)

### Documentation

- Architecture, API Reference, Configuration Guide, Design Rationale
- 4 real-world examples with detailed `.md` threat explanations:
  Fintech, Healthcare, E-Commerce, DevOps
