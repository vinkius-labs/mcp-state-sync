# Design Rationale

> Why each design decision was made. The reasoning behind the constraints.

---

## Why RFC 7234 vocabulary?

LLMs trained on internet-scale corpora have encountered HTTP `Cache-Control` headers in millions of documents: RFC specifications, API documentation, CDN guides, developer discussions. The association between `no-store` and "this response must not be cached" is deeply embedded in transformer weights.

By reusing this exact vocabulary rather than inventing a new signaling protocol, we exploit pre-existing knowledge in the model without requiring fine-tuning, system prompts, or additional instructions. The model "just knows" what `[Cache-Control: no-store]` means because it has read tens of thousands of documents explaining exactly that.

**Alternative considered:** A custom `[Stale-Risk: high]` directive. Rejected because it has zero pre-training signal — the model would need system-prompt instruction to interpret it, adding a fragile dependency.

---

## Why binary (no-store | immutable) and no max-age?

Time-based expiration (`max-age=300`) is only meaningful when the consumer has a clock. In a standard HTTP cache, the browser compares `Date + max-age` against `Now`. An LLM in a context window has no equivalent of `Now`: there is no tick counter, no wall clock, no turn-based timer. Every token exists in an eternal present.

A binary vocabulary eliminates this fundamental incompatibility:

- `no-store` = "always re-read" (volatile data)
- `immutable` = "never re-read" (static reference data)

Any middle ground would require temporal reasoning the LLM cannot perform.

**Alternative considered:** A `stale-while-revalidate` directive. Rejected because "revalidation" implies a conditional request mechanism (`If-None-Match`, `ETag`) that does not exist in MCP.

---

## Why coarse-grained domain invalidation?

An alternative design would track individual entity IDs: "Sprint #123 was mutated, invalidate only Sprint #123." This fails for three reasons:

### 1. External mutations are invisible

Another user or a webhook may have modified Sprint #456 concurrently. Entity-level tracking would miss this entirely — the LLM would continue using stale data for #456 while correctly re-reading #123.

### 2. LLMs cannot reliably track entity identity

The same sprint appears in different formats (`id: 123`, `sprint_id: "S-123"`, embedded in a task response) and the model may not consistently map these to the same invalidation key.

### 3. The cost asymmetry strongly favors over-invalidation

An unnecessary MCP `tools/call` re-read is a few hundred milliseconds. The cost of acting on stale data is incorrect database mutations, corrupted state, and broken user trust. The asymmetry strongly favors conservative invalidation.

Domain-level blast radius (`sprints.*` invalidates all sprint tools) catches external mutations, avoids identity-tracking complexity, and the worst case is a few extra API calls.

---

## Why index 0 for System blocks?

MCP content arrays can be truncated when response size limits apply. Truncation typically removes elements from the end. By placing the System invalidation block at index 0, we ensure it is the **last element to be removed** — the invalidation signal survives even under aggressive truncation.

**Alternative considered:** Using MCP `annotations` or `metadata` fields. Rejected because there is no guarantee that LLMs read annotations; the `content` array is the primary communication channel.

---

## Why duck-typing instead of direct SDK imports?

Both `Server` and `McpServer` from `@modelcontextprotocol/sdk` are detected via structural typing (checking for `setRequestHandler` method) rather than `instanceof` checks.

**Benefits:**

| Property | `instanceof` | Duck-typing |
|---|---|---|
| Version resilience | Breaks on major version bumps | Works across SDK versions |
| Testing | Requires real SDK instances | Any object with the right shape works |
| Bundle size| Forces SDK import at runtime | Zero runtime import needed |
| Fusion integration | Hard dependency | Optional — `RegistryLike` is structural |

---

## Why first-match-wins policy resolution?

The policy engine evaluates rules in declaration order and returns the first match. This is the same model used by:

- CSS cascade (specificity, then order)
- Express.js route matching
- nginx location blocks
- iptables rules

The mental model is familiar to every developer: put specific rules first, general fallbacks last.

**Alternative considered:** Most-specific-match-wins (longest glob). Rejected because it introduces ambiguity (`sprints.*` vs `sprints.update` — which is "more specific"?) and makes policy behavior harder to reason about.

---

## Why fail-fast validation?

All configuration is validated eagerly in the `PolicyEngine` constructor:

```typescript
new PolicyEngine([
  { match: '', cacheControl: 'maybe' },
  // → Throws immediately: Policy[0] (match: ""): "match" must be a non-empty string.
]);
```

**Rationale:** In production, a typo in a policy (`cacheControl: 'no_store'` with underscore) would cause silent failures — the policy would be ignored, and volatile tools would appear without `[Cache-Control: no-store]`. The LLM would then cache data it shouldn't, with no visible error.

Fail-fast validation surfaces these errors at startup, not at runtime.

---

## Why `Object.freeze()` on resolved policies?

Resolved policies are cached in a `Map`. If a consumer mutates a resolved policy object, the mutated version would be served to all subsequent callers from the cache.

`Object.freeze()` prevents this class of bugs entirely. The cost (a single `Object.freeze()` call per unique tool name, cached forever) is negligible.

---

## Why ESM-only?

The MCP SDK (`@modelcontextprotocol/sdk`) is ESM-only. Any package in the MCP ecosystem that uses CommonJS would force consumers into complex interop configurations.

We follow the ecosystem convention: `"type": "module"` in `package.json`, `.js` extensions in imports, `"moduleResolution": "NodeNext"` in `tsconfig.json`.

---

## Why zero `any`?

The codebase has zero `any` types in both source and tests. All generic boundaries use `unknown` with explicit type narrowing.

**Rationale:** `any` disables the type checker at that boundary, creating a gap where runtime errors can occur without compile-time detection. In a security-sensitive layer (cache control for financial, healthcare, and infrastructure data), type safety is non-negotiable.

---

## Why pure functions over methods?

Eight of the twelve modules export pure functions rather than class methods:

| Pure Functions | Classes (stateful) |
|---|---|
| `matchGlob` | `PolicyEngine` (Map cache) |
| `validatePolicies` | `ServerWrapper` (holds PolicyEngine ref) |
| `validateDefaults` | `StateSync` (facade, holds PolicyEngine) |
| `decorateDescription` | |
| `resolveInvalidations` | |
| `decorateResponse` | |
| `isRegistry` | |
| `createFusionUpstream` | |
| `createManualUpstream` | |
| `resolveServer` | |

Pure functions are easier to test (no setup, no mocking), easier to compose, and guarantee no side effects. Classes are used only when state (the resolution cache) is genuinely needed.
