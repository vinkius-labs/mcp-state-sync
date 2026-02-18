# API Reference

> Complete reference for all public exports from `@vinkius-core/mcp-state-sync`.

---

## Classes

### `StateSync`

The public facade. The only class most consumers need.

```typescript
import { StateSync } from '@vinkius-core/mcp-state-sync';
```

#### `new StateSync(config: SyncConfig)`

Creates a new instance. Validates all policies and defaults eagerly — throws immediately on invalid configuration.

```typescript
const sync = new StateSync({
  defaults: { cacheControl: 'no-store' },
  policies: [
    { match: 'sprints.update', invalidates: ['sprints.*'] },
    { match: 'countries.*',    cacheControl: 'immutable' },
  ],
});
```

**Throws:** `Error` if any policy has an empty `match`, invalid `cacheControl`, or invalid `invalidates` patterns.

#### `sync.attachToServer(server, registry, options?)` — Fusion Mode

Attaches to an MCP Server using a Fusion ToolRegistry. StateSync inherits the tool tree from the registry with zero duplication.

| Parameter | Type | Description |
|---|---|---|
| `server` | `Server \| McpServer` | MCP server instance |
| `registry` | `RegistryLike` | Fusion ToolRegistry (duck-typed) |
| `options?` | `FusionAttachOptions` | Optional filter and context factory |

```typescript
sync.attachToServer(server, registry);
sync.attachToServer(server, registry, {
  filter: { tags: ['production'] },
  contextFactory: (extra) => ({ userId: extra.userId }),
});
```

#### `sync.attachToServer(server, config)` — Manual Mode

Attaches to an MCP Server with explicit tool definitions and a handler function.

| Parameter | Type | Description |
|---|---|---|
| `server` | `Server \| McpServer` | MCP server instance |
| `config` | `UpstreamConfig` | Tool definitions + handler |

```typescript
sync.attachToServer(server, {
  tools: [
    { name: 'get_sprint', description: 'Get sprint.', inputSchema: { type: 'object' } },
  ],
  handler: async (name, args, extra) => {
    return { content: [{ type: 'text', text: '{}' }] };
  },
});
```

---

### `PolicyEngine`

Resolves a tool name to its applicable policy. First matching policy wins. Results are cached in a `Map` for O(1) repeated lookups.

```typescript
import { PolicyEngine } from '@vinkius-core/mcp-state-sync';
```

#### `new PolicyEngine(policies, defaults?)`

| Parameter | Type | Description |
|---|---|---|
| `policies` | `readonly SyncPolicy[]` | Policy rules in priority order |
| `defaults?` | `{ cacheControl?: CacheDirective }` | Fallback for unmatched tools |

#### `engine.resolve(toolName: string): ResolvedPolicy | null`

Returns the resolved policy for the given tool name. Returns `null` if no policy matches and no defaults are set.

All returned `ResolvedPolicy` objects are `Object.freeze()`d — immutable by contract.

```typescript
const engine = new PolicyEngine(
  [{ match: 'sprints.*', cacheControl: 'no-store' }],
  { cacheControl: 'no-store' },
);

engine.resolve('sprints.get');     // → { cacheControl: 'no-store' }
engine.resolve('sprints.get');     // → same frozen object (Map cache hit)
engine.resolve('countries.list');  // → { cacheControl: 'no-store' } (default)
```

---

## Pure Functions

Every pure function is independently importable and testable.

### `matchGlob(pattern, name)`

Dot-separated glob matching with `*` and `**` wildcards.

```typescript
import { matchGlob } from '@vinkius-core/mcp-state-sync';

matchGlob('sprints.*', 'sprints.get');        // true
matchGlob('sprints.*', 'sprints.tasks.get');  // false
matchGlob('sprints.**', 'sprints.tasks.get'); // true
matchGlob('**', 'anything.at.all');           // true
matchGlob('*.get', 'sprints.get');            // true
```

---

### `validatePolicies(policies)`

Validates an array of policies. Throws on the first invalid entry. Called internally by `PolicyEngine` at construction time.

```typescript
import { validatePolicies } from '@vinkius-core/mcp-state-sync';

// Throws: Policy[0] (match: ""): "match" must be a non-empty string.
validatePolicies([{ match: '' }]);

// Throws: Policy[1] (match: "x"): cacheControl "maybe" is invalid.
validatePolicies([
  { match: 'a', cacheControl: 'no-store' },
  { match: 'x', cacheControl: 'maybe' as any },
]);
```

---

### `validateDefaults(defaults?)`

Validates the default configuration. Throws if `cacheControl` is not a valid directive.

```typescript
import { validateDefaults } from '@vinkius-core/mcp-state-sync';

validateDefaults({ cacheControl: 'no-store' }); // ok
validateDefaults(undefined);                      // ok

// Throws: Default cacheControl "public" is invalid. Allowed: "no-store", "immutable".
validateDefaults({ cacheControl: 'public' as any });
```

---

### `decorateDescription(tool, policy)`

Appends `[Cache-Control: X]` to a tool's description. Idempotent — calling twice produces the same result.

```typescript
import { decorateDescription } from '@vinkius-core/mcp-state-sync';

const tool = { name: 'sprints.get', description: 'Get sprint.', inputSchema: {} };

decorateDescription(tool, { cacheControl: 'no-store' });
// → { name: 'sprints.get', description: 'Get sprint. [Cache-Control: no-store]', ... }

decorateDescription(tool, null);
// → original tool (unchanged)
```

---

### `resolveInvalidations(policy, isError)`

Determines which domain patterns should be invalidated after a tool call.

```typescript
import { resolveInvalidations } from '@vinkius-core/mcp-state-sync';

resolveInvalidations({ invalidates: ['sprints.*'] }, false);
// → ['sprints.*']

resolveInvalidations({ invalidates: ['sprints.*'] }, true);
// → []  (isError guard: failed mutation, no invalidation)

resolveInvalidations(null, false);
// → []  (no policy)
```

---

### `decorateResponse(result, patterns, causedBy)`

Prepends a `[System: ...]` content block at index 0.

```typescript
import { decorateResponse } from '@vinkius-core/mcp-state-sync';

const result = { content: [{ type: 'text', text: '{"ok":true}' }] };

decorateResponse(result, ['sprints.*'], 'sprints.update');
// → {
//     content: [
//       { type: 'text', text: '[System: Cache invalidated for sprints.* — caused by sprints.update]' },
//       { type: 'text', text: '{"ok":true}' },
//     ]
//   }
```

---

### `isRegistry(source)`

Duck-type detect whether the source is a Fusion ToolRegistry.

```typescript
import { isRegistry } from '@vinkius-core/mcp-state-sync';

isRegistry({ getAllTools: () => [], routeCall: async () => ({}) });
// → true

isRegistry({ tools: [], handler: async () => ({}) });
// → false
```

---

### `createFusionUpstream(registry, options?)`

Creates an `Upstream` adapter from a Fusion ToolRegistry.

---

### `createManualUpstream(config)`

Creates an `Upstream` adapter from explicit tool definitions + handler.

---

### `resolveServer(server)`

Resolves the low-level `Server` from either `Server` or `McpServer`.

```typescript
import { resolveServer } from '@vinkius-core/mcp-state-sync';

resolveServer(new Server(...));     // → Server (direct)
resolveServer(new McpServer(...));  // → McpServer.server (unwrapped)
resolveServer(null);                // throws: "StateSync: expected a Server..."
resolveServer({});                  // throws: "...does not have setRequestHandler()"
```

---

## Types

```typescript
/** Binary cache directive. LLMs have no clock — max-age is impossible. */
type CacheDirective = 'no-store' | 'immutable';

/** A single policy rule, matched by glob pattern. */
interface SyncPolicy {
  readonly match: string;
  readonly cacheControl?: CacheDirective;
  readonly invalidates?: readonly string[];
}

/** Top-level configuration. */
interface SyncConfig {
  readonly policies: readonly SyncPolicy[];
  readonly defaults?: {
    readonly cacheControl?: CacheDirective;
  };
}

/** Result of resolving a policy for a specific tool name. */
interface ResolvedPolicy {
  readonly cacheControl?: CacheDirective;
  readonly invalidates?: readonly string[];
}

/** MCP tool definition (duck-typed). */
interface McpToolDef {
  readonly name: string;
  description?: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations?: Record<string, unknown>;
}

/** MCP call result (duck-typed). */
interface McpCallResult {
  content: Array<{ type: string; [key: string]: unknown }>;
  isError?: boolean;
}

/** Manual upstream configuration. */
interface UpstreamConfig {
  readonly tools: readonly McpToolDef[];
  readonly handler: (
    name: string,
    args: Record<string, unknown>,
    extra: unknown,
  ) => Promise<McpCallResult>;
}

/** Upstream tool provider abstraction. */
interface Upstream {
  listTools(): { tools: McpToolDef[] };
  callTool(name: string, args: Record<string, unknown>, extra: unknown): Promise<McpCallResult>;
}

/** Duck-typed Fusion ToolRegistry. */
interface RegistryLike {
  getAllTools(): McpToolDef[];
  getTools(filter: { tags?: string[]; exclude?: string[] }): McpToolDef[];
  routeCall(ctx: unknown, name: string, args: Record<string, unknown>): Promise<McpCallResult>;
}

/** Fusion-mode attach options. */
interface FusionAttachOptions {
  filter?: { tags?: string[]; exclude?: string[] };
  contextFactory?: (extra: unknown) => unknown;
}

/** Duck-typed low-level MCP Server. */
interface McpServerLike {
  setRequestHandler(schema: unknown, handler: (...args: unknown[]) => unknown): void;
}
```
