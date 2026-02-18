# Fintech Wire Transfer Guard

> How `mcp-state-sync` prevents overdraft and double-spend in LLM-powered financial assistants.

---

## The Scenario

An LLM-powered financial assistant manages customer accounts via MCP tools: balance inquiries, wire transfers, payment processing, and transaction history. Multiple channels — mobile banking, web portal, branch terminals, and the AI assistant itself — can modify account balances concurrently.

## The Danger

```
Turn 1: LLM reads accounts.getBalance("ACC-9201")
        → Response: $12,340.00

Turn 2: Customer opens mobile app and initiates a $10,000 wire transfer
        → Real balance is now $2,340.00
        → The LLM has no way to observe this event

Turn 3: LLM receives request: "Transfer $5,000 from ACC-9201 to ACC-7703"
        → LLM checks its context: balance was $12,340 (Turn 1)
        → LLM approves: $12,340 - $5,000 = $7,340 (looks fine)
        → transfers.create() is called

Turn 4: Database executes the transfer
        → Actual: $2,340 - $5,000 = -$2,660
        → OVERDRAFT
```

The LLM acted rationally given its context. The problem is that its context was **stale**. The $12,340 balance from Turn 1 was treated as current fact at Turn 3 because the model has no temporal reasoning — every token in the context window has equal epistemological weight.

This is **Temporal Blindness**: the LLM cannot distinguish between "data I read 2 seconds ago" and "data I read 10 minutes ago."

## How StateSync Solves This

### Static signal — `[Cache-Control: no-store]`

When the LLM calls `tools/list`, every financial tool's description carries a `[Cache-Control: no-store]` directive:

```
name: "accounts.getBalance"
description: "Get current account balance and available credit. [Cache-Control: no-store]"
```

The model has seen `Cache-Control: no-store` in millions of HTTP documents during pre-training. It associates this directive with "do not reuse this response" without needing explicit instruction.

### Dynamic signal — Causal Domain Invalidation

When `transfers.create` succeeds, the response carries a System block at index 0:

```
Content Block 0:
  [System: Cache invalidated for accounts.*, transfers.*, transactions.* — caused by transfers.create]

Content Block 1:
  {"ok": true, "transfer_id": "TXN-8821", "new_balance": 7340.00}
```

This explicitly tells the LLM: "the account balances, transfer list, and transaction history you previously read are now stale. Re-read before making any further decisions."

### The `isError` safety guard

If the transfer fails (insufficient funds, invalid account, etc.), the response comes back with `isError: true` and **no invalidation signal**:

```
Content Block 0:
  {"error": "Insufficient funds", "available": 2340.00}

(No System block — the database was not mutated)
```

This prevents unnecessary re-reads after failed operations.

## Policy Configuration

```typescript
const sync = new StateSync({
    defaults: { cacheControl: 'no-store' },
    policies: [
        // Reference data — safe to cache forever
        { match: 'currencies.*',   cacheControl: 'immutable' },
        { match: 'countries.*',    cacheControl: 'immutable' },
        { match: 'exchangeRates.supported', cacheControl: 'immutable' },

        // Wire transfers → invalidate account + transaction domains
        {
            match: 'transfers.create',
            invalidates: [
                'accounts.*',       // Sender + receiver balances changed
                'transfers.*',      // Transfer list is stale
                'transactions.*',   // Transaction history is stale
            ],
        },

        // Payment processing → invalidate account + invoice domains
        {
            match: 'payments.process',
            invalidates: [
                'accounts.*',
                'invoices.*',
                'payments.*',
            ],
        },

        // Account limit changes
        {
            match: 'accounts.updateLimits',
            invalidates: ['accounts.*'],
        },

        // Everything else: volatile by default (no-store from defaults)
    ],
});
```

### Why this policy structure works

| Tool | Directive | Invalidates | Reasoning |
|---|---|---|---|
| `accounts.getBalance` | `no-store` (default) | — | Balance changes every time; never trust cached values |
| `transfers.create` | `no-store` (default) | `accounts.*`, `transfers.*`, `transactions.*` | A successful transfer mutates balances across two accounts |
| `currencies.list` | `immutable` | — | ISO 4217 currency codes don't change within a session |
| `payments.process` | `no-store` (default) | `accounts.*`, `invoices.*`, `payments.*` | Payments affect balance AND invoice status |

### Cross-domain invalidation

Notice that `transfers.create` invalidates `accounts.*` (not just `accounts.getBalance`). This is coarse-grained by design. If there's an `accounts.getTransactionLimit` tool, it gets invalidated too — even though a wire transfer doesn't change limits.

The cost of this over-invalidation is one extra API call. The alternative (missing an invalidation) is an overdraft. The asymmetry strongly favors conservative invalidation.

## Complete Code Example

→ See [`fintech-wire-transfer-guard.ts`](./fintech-wire-transfer-guard.ts)
