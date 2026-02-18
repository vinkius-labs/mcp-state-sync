/**
 * Example: Fintech Wire Transfer Guard
 *
 * Scenario: An LLM-powered financial assistant manages customer accounts,
 * processes wire transfers, and provides balance inquiries via MCP tools.
 *
 * The Danger Without StateSync:
 *
 *   Turn 1: LLM reads accounts.getBalance("ACC-9201") → $12,340.00
 *   Turn 2: Customer initiates a $10,000 wire via mobile banking app
 *   Turn 3: LLM approves a $5,000 transfer request based on Turn 1 balance
 *   Result: OVERDRAFT — real balance was $2,340 but LLM saw $12,340
 *
 * With StateSync, the `no-store` directive forces the LLM to always re-read
 * balances before acting. The causal invalidation after a successful transfer
 * explicitly tells the LLM that account data is stale.
 *
 * Run: npx tsx examples/fintech-wire-transfer-guard.ts
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StateSync } from '@vinkius-core/mcp-state-sync';

// ── MCP Server Setup ────────────────────────────────────────────────

const server = new Server({ name: 'fintech-assistant', version: '1.0.0' }, {
    capabilities: { tools: {} },
});

// ── StateSync Configuration ─────────────────────────────────────────
//
// Policy design:
//   - ALL financial data is `no-store` (never trust cached balances)
//   - Wire transfers invalidate account AND transaction domains
//   - Payment processing invalidates account AND invoice domains
//   - Reference data (currencies, countries) is immutable

const sync = new StateSync({
    defaults: { cacheControl: 'no-store' },
    policies: [
        // ── Reference data (safe to cache forever) ──────────────
        { match: 'currencies.*',   cacheControl: 'immutable' },
        { match: 'countries.*',    cacheControl: 'immutable' },
        { match: 'exchangeRates.supported', cacheControl: 'immutable' },

        // ── Write operations with causal invalidation ───────────
        {
            match: 'transfers.create',
            invalidates: [
                'accounts.*',       // Sender + receiver balances changed
                'transfers.*',      // Transfer list is stale
                'transactions.*',   // Transaction history is stale
            ],
        },
        {
            match: 'payments.process',
            invalidates: [
                'accounts.*',       // Account balance changed
                'invoices.*',       // Invoice status changed
                'payments.*',       // Payment list is stale
            ],
        },
        {
            match: 'accounts.updateLimits',
            invalidates: ['accounts.*'],
        },

        // ── Everything else: volatile by default (no-store) ─────
        // accounts.getBalance, accounts.list, transactions.list, etc.
        // All inherit `no-store` from defaults — LLM must always re-read
    ],
});

// ── Attach (Manual Mode — explicit tool definitions) ────────────────

sync.attachToServer(server, {
    tools: [
        {
            name: 'accounts.getBalance',
            description: 'Get current account balance and available credit.',
            inputSchema: {
                type: 'object',
                properties: {
                    accountId: { type: 'string', description: 'Account ID (e.g. ACC-9201)' },
                },
                required: ['accountId'],
            },
        },
        {
            name: 'transfers.create',
            description: 'Initiate a wire transfer between accounts.',
            inputSchema: {
                type: 'object',
                properties: {
                    fromAccount: { type: 'string' },
                    toAccount: { type: 'string' },
                    amount: { type: 'number' },
                    currency: { type: 'string' },
                },
                required: ['fromAccount', 'toAccount', 'amount', 'currency'],
            },
        },
        {
            name: 'currencies.list',
            description: 'List all supported currencies.',
            inputSchema: { type: 'object' },
        },
    ],
    handler: async (name, args) => {
        // Your actual business logic here
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
    },
});

// ── What the LLM Sees ───────────────────────────────────────────────
//
// tools/list response:
//   {
//     name: "accounts.getBalance",
//     description: "Get current account balance and available credit. [Cache-Control: no-store]"
//   }
//   {
//     name: "transfers.create",
//     description: "Initiate a wire transfer between accounts. [Cache-Control: no-store]"
//   }
//   {
//     name: "currencies.list",
//     description: "List all supported currencies. [Cache-Control: immutable]"
//   }
//
// After a successful transfers.create call:
//   Content Block 0: [System: Cache invalidated for accounts.*, transfers.*, transactions.* — caused by transfers.create]
//   Content Block 1: {"ok": true, "transfer_id": "TXN-8821"}
//
// The LLM now knows:
//   1. It MUST re-read account balances before making any decision
//   2. Its cached transaction history is stale
//   3. Currency data is safe to reference from memory
