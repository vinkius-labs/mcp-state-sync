<p align="center">
  <strong>@vinkius-core/mcp-state-sync</strong>
</p>

<p align="center">
  <em>Solving LLM Temporal Blindness and Causal State Drift<br>via RFC 7234 Cache-Control semantics for the Model Context Protocol</em>
</p>

<p align="center">
  <a href="#research-foundation">Research</a> ·
  <a href="#the-problem">Problem</a> ·
  <a href="#the-solution">Solution</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#real-world-examples">Examples</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#documentation">Docs</a>
</p>

---

## Research Foundation

This library addresses two failure modes recently formalized in academic research:

> **"Your LLM Agents are Temporally Blind"**
> Cheng, Moakhar, Fan, Hosseini, Faghih, Sodagar, Wang & Feizi — University of Maryland, 2025
> [arXiv:2510.23853](https://arxiv.org/abs/2510.23853)
>
> Coined the term **Temporal Blindness**: LLM agents assume a stationary context and fail to account for real-world time elapsed between messages. The study proves that *"agents frequently over-rely on stale context and skip needed tool calls"* — no model tested achieved a normalized alignment rate better than 65% with human temporal perception.

> **"State Drift in Language-Conditioned Autonomous Agents"**
> Singh, S.K. — Preprints.org, January 2026
> [Preprints:202601.0910](https://www.preprints.org/manuscript/202601.0910)
>
> Formalized **State Drift**: the gradual, hidden misalignment between an agent's internal textual representation and the true environment state. The key finding: *"increasing context capacity alone does not prevent its emergence or persistence"* — giving an LLM 2 million tokens does not solve drift if the database changes externally.

**mcp-state-sync** is an engineering response to both findings. It uses RFC 7234 `Cache-Control` vocabulary — deeply embedded in LLM pre-training data — to signal data volatility (`no-store`) and causal invalidation (`[System: Cache invalidated...]`) directly through the MCP protocol layer.

---

## The Problem

### Temporal Blindness

LLMs have no concept of time. They cannot distinguish between data read 2ms ago and data read 20 minutes ago — both exist as equally valid facts inside the context window. This is not a bug; it is a fundamental architectural property of transformer-based models, [formally proven by Cheng et al.](https://arxiv.org/abs/2510.23853) Every token in the context window has equal epistemological weight regardless of when it entered.

When an LLM reads sprint data via MCP at turn 3, and a human moves a task via the mobile app at turn 5, the LLM continues planning at turn 7 using the turn-3 snapshot as ground truth. It has no mechanism to detect that the world has changed.

### Causal State Drift

The problem compounds when the LLM itself causes mutations — a phenomenon [formalized by Singh (2026)](https://www.preprints.org/manuscript/202601.0910) as **State Drift**:

```
Turn 1: LLM reads sprint S1 → context now contains { tasks: [T1, T2, T3] }
Turn 2: LLM calls sprints.update(S1, { tasks: [T1, T2] })  → removes T3
Turn 3: LLM reads sprint S1 again → still sees { tasks: [T1, T2, T3] } in context
```

At turn 3, the LLM has **two contradictory representations** of the same entity. The stale read from turn 1 and the fresh read from turn 3 coexist. The model has no causal reasoning to prefer the newer one. Worse, the original read often has more surrounding context tokens (the full planning conversation), making it *more salient* to the attention mechanism despite being *less accurate*.

This is Causal State Drift: the LLM's internal state drifts from the actual system state, and it cannot self-correct because it lacks the temporal metadata to detect the drift.

### Why This Matters

In agentic systems where LLMs execute multi-step workflows — managing infrastructure, processing payments, prescribing medications — Causal State Drift leads to:

| Failure Mode | Description | Severity |
|---|---|---|
| **Phantom operations** | Acting on entities that no longer exist in their expected state | 🔴 Critical |
| **Silent data corruption** | Overwriting concurrent changes without detecting conflicts | 🔴 Critical |
| **Stale reasoning loops** | Repeated decisions based on outdated context that never self-correct | 🟡 High |
| **Cascading failures** | One stale assumption compounds across a chain of tool calls | 🔴 Critical |

The failure mode is insidious: the LLM behaves confidently and produces syntactically correct tool calls. The errors only manifest as incorrect data in the database — invisible to the model and often to the user until downstream consequences emerge.

---

## The Solution

**mcp-state-sync** introduces two machine-to-machine signaling mechanisms, both designed to exploit the LLM's deep training on HTTP infrastructure semantics:

### 1 — Cache-Control Directives (Static)

Appended to tool descriptions during `tools/list`:

```
Tool: sprints.get
Description: Get sprint details. [Cache-Control: no-store]
```

The model doesn't need to "understand" caching theory — it has seen `Cache-Control: no-store` millions of times in HTTP documentation, API specs, and developer discussions. The association between `no-store` and "do not reuse this response" is deeply embedded in the model's weights.

### 2 — Causal Domain Invalidation (Dynamic)

Injected as a System content block at index 0 of successful write responses:

```
Content[0]: [System: Cache invalidated for sprints.* — caused by sprints.update]
Content[1]: {"ok": true, "sprint_id": 123}
```

This creates an explicit causal link: "your write just invalidated these domains, re-read before acting on cached data."

### Binary Cache Vocabulary

| Directive | Semantics | Use Case |
|---|---|---|
| `no-store` | **Never reuse** cached data. Always re-fetch. | Balances, inventory, patient records, infrastructure state |
| `immutable` | **Safe to cache forever.** Data will never change. | Countries, currencies, ICD-10 codes, AWS regions |

There is no `max-age`. LLMs have no clock — time-based expiration is meaningless inside a context window.

### Safety Guards

| Guard | Behavior |
|---|---|
| **isError gate** | Failed mutations → no invalidation (database unchanged) |
| **Index 0 positioning** | System block survives response truncation |
| **Coarse-grained domains** | `sprints.*` catches external mutations the LLM can't observe |
| **Idempotent decoration** | Calling twice produces the same result |

---

## Quick Start

```bash
npm install @vinkius-core/mcp-state-sync
```

**Peer dependency:** `@modelcontextprotocol/sdk >= 1.12.1`

### With mcp-fusion (Fusion Mode)

```typescript
import { ToolRegistry } from '@vinkius-core/mcp-fusion';
import { StateSync } from '@vinkius-core/mcp-state-sync';

const registry = new ToolRegistry();
// ... register tool modules ...

const sync = new StateSync({
  defaults: { cacheControl: 'no-store' },
  policies: [
    { match: 'sprints.update', invalidates: ['sprints.*'] },
    { match: 'tasks.update',   invalidates: ['tasks.*', 'sprints.*'] },
    { match: 'countries.*',    cacheControl: 'immutable' },
  ],
});

sync.attachToServer(server, registry);
```

### Without mcp-fusion (Manual Mode)

```typescript
import { StateSync } from '@vinkius-core/mcp-state-sync';

const sync = new StateSync({
  defaults: { cacheControl: 'no-store' },
  policies: [
    { match: 'update_sprint', invalidates: ['get_sprint', 'list_sprints'] },
    { match: 'countries',     cacheControl: 'immutable' },
  ],
});

sync.attachToServer(server, {
  tools: myToolDefinitions,
  handler: async (name, args, extra) => myHandler(name, args, extra),
});
```

---

## Real-World Examples

Each example includes a detailed explanation (`.md`) of the threat model and how StateSync neutralizes it, alongside a complete TypeScript implementation (`.ts`).

### 🏦 [Fintech Wire Transfer Guard](./examples/fintech-wire-transfer-guard.md)

An LLM reads a $12,340 balance. A customer transfers $10,000 via mobile banking. The LLM approves a $5,000 transfer based on the stale balance → **overdraft**.

StateSync forces `no-store` on all account tools and invalidates `accounts.*`, `transfers.*`, `transactions.*` after every successful transfer.

→ [Explanation](./examples/fintech-wire-transfer-guard.md) · [Code](./examples/fintech-wire-transfer-guard.ts)

---

### 🏥 [Healthcare Patient Record Sync](./examples/healthcare-patient-records.md)

An LLM reads allergies: `["Penicillin"]`. A nurse adds `"Sulfonamides"` via the hospital EMR. The LLM recommends Sulfamethoxazole → **adverse drug reaction**.

StateSync marks all patient data as `no-store` and invalidates `patient.*`, `prescriptions.*`, `interactions.*` after every prescription write.

→ [Explanation](./examples/healthcare-patient-records.md) · [Code](./examples/healthcare-patient-records.ts)

---

### 🛒 [E-Commerce Inventory Protection](./examples/ecommerce-inventory-protection.md)

An LLM reads "3 units in stock." A customer buys 2 via the website. The LLM promises 3 units to another customer → **oversell**.

StateSync forces `no-store` on inventory tools and invalidates `inventory.*`, `orders.*`, `products.*` after every order creation.

→ [Explanation](./examples/ecommerce-inventory-protection.md) · [Code](./examples/ecommerce-inventory-protection.ts)

---

### ☁️ [DevOps Infrastructure State](./examples/devops-infrastructure-state.md)

An LLM reads 4 running instances. Auto-scaling terminates 2. The LLM reports "capacity sufficient" → **outage**. Worse: the LLM overwrites a security group with stale rules → **silently deletes SSH access**.

StateSync marks all infrastructure tools as `no-store` and invalidates cross-resource domains (instances, security groups, costs) after mutations.

→ [Explanation](./examples/devops-infrastructure-state.md) · [Code](./examples/devops-infrastructure-state.ts)

---

## Architecture

```
StateSync (Facade)
  ├─ PolicyEngine           ← First-match-wins resolution + Map cache (O(1) repeat)
  │    ├─ GlobMatcher           ← Dot-separated glob matching (* and **)
  │    └─ PolicyValidator       ← Fail-fast eager validation at construction
  └─ ServerWrapper          ← MCP Server interception (tools/list + tools/call)
       ├─ DescriptionDecorator  ← Append [Cache-Control: X] to descriptions
       ├─ CausalEngine          ← isError guard + invalidation resolution
       └─ ResponseDecorator     ← Prepend [System: ...] at index 0

UpstreamFactory             ← Fusion / Manual upstream adapters
ServerResolver              ← Duck-type Server vs McpServer resolution
```

**12 modules. Single responsibility each. Zero `any`. Pure functions where possible. Classes only where state is needed.**

| Property | Value |
|---|---|
| Source modules | 12 |
| Test files | 8 |
| Tests | 56 (all passing) |
| `any` count | 0 |
| Peer dependencies | 1 (`@modelcontextprotocol/sdk`) |
| Runtime dependencies | 0 |

---

## Documentation

| Document | Description |
|---|---|
| **[Architecture](./docs/architecture.md)** | Module map, data flow diagrams, immutability guarantees, duck-typing strategy |
| **[API Reference](./docs/api-reference.md)** | Complete reference for all public classes, functions, and types |
| **[Configuration Guide](./docs/configuration.md)** | Policy syntax, glob patterns, resolution order, validation rules, common patterns |
| **[Design Rationale](./docs/design-rationale.md)** | Why each decision was made — RFC 7234, binary vocabulary, coarse-grained invalidation, index 0, duck-typing |

---

## Compatibility

| Requirement | Version |
|---|---|
| Node.js | ≥ 18.0.0 |
| `@modelcontextprotocol/sdk` | ≥ 1.12.1 (peer dependency) |
| TypeScript | ≥ 5.0 (ESM, `"moduleResolution": "NodeNext"`) |

**Optional integration:** Works with [`@vinkius-core/mcp-fusion`](https://github.com/vinkius-labs/mcp-fusion) for multi-module MCP servers. Not required — Manual Mode provides full functionality without mcp-fusion.
