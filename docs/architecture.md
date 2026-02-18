# Architecture

> Internal module structure, data flow, and design constraints.

---

## Module Map

```
StateSync (Facade)
  ├─ PolicyEngine           ← First-match-wins resolution (with Map cache)
  │    ├─ GlobMatcher           ← Dot-separated glob matching (* and **)
  │    └─ PolicyValidator       ← Fail-fast eager validation at construction
  └─ ServerWrapper          ← MCP Server interception (tools/list + tools/call)
       ├─ DescriptionDecorator  ← Append [Cache-Control: X] to tools/list
       ├─ CausalEngine          ← isError guard + invalidation pattern resolution
       └─ ResponseDecorator     ← Prepend [System: ...] to write responses

UpstreamFactory             ← Creates Fusion / Manual upstream adapters
ServerResolver              ← Duck-type Server vs McpServer resolution
```

**12 modules. Single responsibility each. Pure functions where possible. Classes only where state is needed.**

---

## Module Inventory

| Module | Type | LOC | Responsibility |
|---|---|---|---|
| `StateSync` | Class | 71 | Public facade. Config → PolicyEngine → ServerWrapper |
| `PolicyEngine` | Class | 67 | First-match-wins resolution with `Map<string, ResolvedPolicy>` cache |
| `GlobMatcher` | Pure fn | 52 | Recursive dot-separated glob matching |
| `PolicyValidator` | Pure fn | 77 | Fail-fast validation of policies and defaults at construction |
| `ServerWrapper` | Class | 75 | Intercepts `tools/list` and `tools/call` on the MCP Server |
| `DescriptionDecorator` | Pure fn | 38 | Idempotent `[Cache-Control: X]` append to descriptions |
| `CausalEngine` | Pure fn | 28 | `isError` guard + invalidation pattern resolution |
| `ResponseDecorator` | Pure fn | 35 | Prepends `[System: ...]` content block at index 0 |
| `UpstreamFactory` | Pure fn | 79 | Creates Fusion and Manual `Upstream` adapters |
| `ServerResolver` | Pure fn | 51 | Duck-type resolution for `Server` and `McpServer` |
| `types` | Types | 81 | All public types (`SyncPolicy`, `SyncConfig`, `CacheDirective`, etc.) |
| `index` | Barrel | 39 | Re-exports everything |

---

## Data Flow

### `tools/list` — Static Cache-Control Decoration

```
Client sends: tools/list

  → ServerWrapper receives request
    → Upstream.listTools()
        Fusion: registry.getAllTools() or registry.getTools(filter)
        Manual: returns static tool array
    → For each tool:
        PolicyEngine.resolve(tool.name)
          → Check Map cache (O(1) if seen before)
          → If miss: iterate policies, matchGlob(pattern, name)
          → First match wins
          → Falls back to defaults.cacheControl
          → Object.freeze() resolved policy, store in Map
        DescriptionDecorator(tool, resolvedPolicy)
          → If no cacheControl: return tool unchanged
          → Strip existing [Cache-Control: X] if present (idempotency)
          → Append ` [Cache-Control: no-store]` or ` [Cache-Control: immutable]`
    → Return { tools: decoratedTools }

Client receives:
  { name: "sprints.get", description: "Get sprint. [Cache-Control: no-store]" }
```

### `tools/call` — Dynamic Causal Invalidation

```
Client sends: tools/call { name: "sprints.update", arguments: { id: 10 } }

  → ServerWrapper receives request
    → Upstream.callTool("sprints.update", { id: 10 }, extra)
        Fusion: registry.routeCall(ctx, name, args)
        Manual: config.handler(name, args, extra)
    → result: { content: [{ type: "text", text: '{"ok":true}' }], isError: false }
    → PolicyEngine.resolve("sprints.update")
        → resolvedPolicy: { invalidates: ["sprints.*"] }
    → CausalEngine.resolveInvalidations(policy, isError=false)
        → isError is false → return ["sprints.*"]
    → ResponseDecorator.decorateResponse(result, ["sprints.*"], "sprints.update")
        → Prepend: { type: "text", text: "[System: Cache invalidated for sprints.* — caused by sprints.update]" }
    → Return modified result

Client receives:
  content[0]: [System: Cache invalidated for sprints.* — caused by sprints.update]
  content[1]: {"ok":true}
```

### Error Path — isError Guard

```
Client sends: tools/call { name: "sprints.update", arguments: { id: 999 } }

  → Upstream.callTool(...)
    → result: { content: [{ type: "text", text: "Sprint not found" }], isError: true }
  → CausalEngine.resolveInvalidations(policy, isError=true)
    → isError is true → return []  (no invalidation)
  → Return original result unchanged

Client receives:
  content[0]: Sprint not found
  (no System block — the mutation failed, database unchanged)
```

---

## Immutability Guarantees

| Component | Guarantee |
|---|---|
| `PolicyEngine.policies` | `Object.freeze()` on the shallow copy |
| `ResolvedPolicy` | Every returned object is `Object.freeze()`d |
| `ResolvedPolicy.invalidates` | `Object.freeze()` on the defensive copy |
| `SyncPolicy` arrays | Constructor creates a frozen copy, never references the original |
| `DescriptionDecorator` | Returns a new object, never mutates the input tool |
| `ResponseDecorator` | Returns a new result with spread, never mutates the input |

---

## Duck-Typing Strategy

Both `Server` detection and Fusion `ToolRegistry` detection use structural typing rather than `instanceof`:

### ServerResolver

```typescript
// Detects McpServer (wraps a Server at .server)
if ('server' in obj && typeof obj.server.setRequestHandler === 'function')
  → return obj.server

// Detects low-level Server
if (typeof obj.setRequestHandler === 'function')
  → return obj
```

### UpstreamFactory — RegistryLike

```typescript
// Detects Fusion ToolRegistry
if (typeof obj.getAllTools === 'function' && typeof obj.routeCall === 'function')
  → source is RegistryLike
```

**Why:** Version resilience across SDK updates, testing simplicity, and optional Fusion integration without hard dependencies.
