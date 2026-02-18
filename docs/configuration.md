# Configuration Guide

> How to configure policies, defaults, and glob patterns.

---

## `SyncConfig`

The top-level configuration object passed to `new StateSync(config)`.

```typescript
interface SyncConfig {
  policies: SyncPolicy[];
  defaults?: {
    cacheControl?: 'no-store' | 'immutable';
  };
}
```

| Field | Required | Description |
|---|---|---|
| `policies` | Yes | Array of policy rules. Evaluated in declaration order (first match wins). |
| `defaults` | No | Fallback applied when no policy matches a tool. |
| `defaults.cacheControl` | No | Default directive for unmatched tools. |

---

## `SyncPolicy`

A single policy rule.

```typescript
interface SyncPolicy {
  match: string;
  cacheControl?: 'no-store' | 'immutable';
  invalidates?: string[];
}
```

| Field | Required | Description |
|---|---|---|
| `match` | Yes | Glob pattern to match tool names. Non-empty string. |
| `cacheControl` | No | Static directive. Falls back to `defaults.cacheControl` if omitted. |
| `invalidates` | No | Glob patterns of tools to invalidate on successful write. |

---

## Cache Directives

Binary vocabulary — LLMs have no clock, so `max-age` is impossible:

| Directive | Semantics | Use Case |
|---|---|---|
| `no-store` | **Never reuse** cached data. Always re-fetch. | Sprints, tasks, user profiles, balances, real-time status |
| `immutable` | **Safe to cache forever.** Data will never change. | Countries, currencies, timezones, permission enums |
| *(no directive)* | No intervention. The LLM decides autonomously. | Low-risk data where staleness is acceptable |

---

## Glob Pattern Syntax

Patterns use dot-separated segments with two wildcards:

| Pattern | Matches | Does NOT Match |
|---|---|---|
| `sprints.*` | `sprints.get`, `sprints.update` | `sprints.tasks.get` |
| `sprints.**` | `sprints.get`, `sprints.tasks.get`, `sprints.tasks.list` | `tasks.get` |
| `**` | Everything | *(matches all)* |
| `*.get` | `sprints.get`, `tasks.get` | `sprints.tasks.get` |
| `sprints.update` | `sprints.update` (exact) | `sprints.get` |

### Rules:
- Segments are separated by `.`
- `*` matches **exactly one** segment
- `**` matches **zero or more** segments
- Patterns are case-sensitive
- Empty patterns (`""`) are rejected at validation time

---

## Policy Resolution Order

Policies are evaluated in **declaration order** — the first matching policy wins. This enables precise override patterns:

```typescript
const sync = new StateSync({
  defaults: { cacheControl: 'no-store' },
  policies: [
    // 1. Specific overrides first (immutable reference data)
    { match: 'countries.*',    cacheControl: 'immutable' },
    { match: 'currencies.*',  cacheControl: 'immutable' },

    // 2. Write operations with causal invalidation
    { match: 'sprints.update', invalidates: ['sprints.*'] },
    { match: 'sprints.create', invalidates: ['sprints.*'] },
    { match: 'tasks.update',   invalidates: ['tasks.*', 'sprints.*'] },

    // 3. Everything else: inherits `no-store` from defaults
  ],
});
```

**Key pattern:** Put specific rules first, general rules last — just like CSS, Express routes, or iptables.

---

## Validation

All configuration is validated eagerly at construction time. Invalid configs throw immediately with descriptive error messages:

```
Policy[0] (match: ""): "match" must be a non-empty string.
Policy[2] (match: "sprints.update"): cacheControl "maybe" is invalid. Allowed: "no-store", "immutable".
Policy[3] (match: "tasks.*"): invalidates[0] must be a non-empty string.
Default cacheControl "public" is invalid. Allowed: "no-store", "immutable".
```

### What is validated:

| Check | Error |
|---|---|
| `match` is empty string | `"match" must be a non-empty string` |
| `match` is not a string | `"match" must be a non-empty string` |
| `cacheControl` is not `no-store` or `immutable` | `cacheControl "X" is invalid` |
| `invalidates` contains empty strings | `invalidates[N] must be a non-empty string` |
| `invalidates` items are not strings | `invalidates[N] must be a non-empty string` |
| Default `cacheControl` is not valid | `Default cacheControl "X" is invalid` |

---

## Common Patterns

### All volatile except reference data

```typescript
new StateSync({
  defaults: { cacheControl: 'no-store' },
  policies: [
    { match: 'countries.*',  cacheControl: 'immutable' },
    { match: 'currencies.*', cacheControl: 'immutable' },
  ],
});
```

### Write-invalidation only (no static directives)

```typescript
new StateSync({
  policies: [
    { match: 'sprints.update', invalidates: ['sprints.*'] },
    { match: 'tasks.create',   invalidates: ['tasks.*', 'sprints.*'] },
  ],
});
```

### Cross-domain cascade

When updating a task also affects its parent sprint:

```typescript
{
  match: 'tasks.update',
  invalidates: ['tasks.*', 'sprints.*'],
}
```

### Catch-all write guard

```typescript
{
  match: '**.update',
  invalidates: ['**'],  // Nuclear option: invalidate everything
}
```
