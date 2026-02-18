/**
 * Example: E-Commerce Inventory Protection
 *
 * Scenario: An LLM-powered commerce assistant manages product catalog,
 * inventory, and order processing for an online store via MCP tools.
 *
 * The Danger Without StateSync:
 *
 *   Turn 1: LLM reads inventory.getStock("SKU-7782") → 3 units
 *   Turn 2: Customer buys 2 units via the website checkout
 *   Turn 3: Another customer asks the LLM "Is SKU-7782 available?"
 *   Turn 4: LLM says "Yes, we have 3 in stock" and creates an order for 3
 *   Result: OVERSELL — only 1 unit was actually available
 *
 * With StateSync, inventory data is `no-store`. When the LLM creates an
 * order, inventory and order domains are invalidated — preventing the LLM
 * from quoting stale stock levels.
 *
 * Run: npx tsx examples/ecommerce-inventory-protection.ts
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StateSync } from '@vinkius-core/mcp-state-sync';

const server = new Server({ name: 'commerce-assistant', version: '1.0.0' }, {
    capabilities: { tools: {} },
});

// ── StateSync Configuration ─────────────────────────────────────────
//
// Design principle: Inventory is the most volatile data in e-commerce.
// Multiple channels (website, mobile app, POS, marketplace integrations)
// can modify stock levels concurrently. The LLM must NEVER trust cached
// stock counts.
//
// Product catalog metadata (names, descriptions, categories) changes
// rarely during a session, but prices can change. We keep everything
// as `no-store` by default, with only category taxonomy as immutable.

const sync = new StateSync({
    defaults: { cacheControl: 'no-store' },
    policies: [
        // ── Reference data (stable within a session) ────────────────
        { match: 'categories.*',   cacheControl: 'immutable' },
        { match: 'shipping.zones', cacheControl: 'immutable' },
        { match: 'taxes.rates',    cacheControl: 'immutable' },

        // ── Order creation: the most critical write ─────────────────
        {
            match: 'orders.create',
            invalidates: [
                'inventory.*',     // Stock levels changed
                'orders.*',        // Order list is stale
                'products.*',      // Product availability status may change
            ],
        },

        // ── Order cancellation: reverses inventory impact ───────────
        {
            match: 'orders.cancel',
            invalidates: [
                'inventory.*',     // Stock returned
                'orders.*',        // Order status changed
            ],
        },

        // ── Price updates ───────────────────────────────────────────
        {
            match: 'products.updatePrice',
            invalidates: [
                'products.*',      // Product prices are stale
                'cart.*',          // Cart totals are stale
            ],
        },

        // ── Inventory adjustments ───────────────────────────────────
        {
            match: 'inventory.adjust',
            invalidates: ['inventory.*', 'products.*'],
        },

        // ── Everything else: no-store ───────────────────────────────
        // inventory.getStock, products.getPrice, orders.list, cart.get
        // All inherit no-store from defaults
    ],
});

sync.attachToServer(server, {
    tools: [
        {
            name: 'inventory.getStock',
            description: 'Get current stock level for a product SKU.',
            inputSchema: {
                type: 'object',
                properties: {
                    sku: { type: 'string', description: 'Product SKU (e.g. SKU-7782)' },
                },
                required: ['sku'],
            },
        },
        {
            name: 'orders.create',
            description: 'Create a new customer order. Validates stock availability.',
            inputSchema: {
                type: 'object',
                properties: {
                    customerId: { type: 'string' },
                    items: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                sku: { type: 'string' },
                                quantity: { type: 'number' },
                            },
                        },
                    },
                },
                required: ['customerId', 'items'],
            },
        },
        {
            name: 'categories.list',
            description: 'List all product categories.',
            inputSchema: { type: 'object' },
        },
    ],
    handler: async (name, args) => {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
    },
});

// ── What the LLM Sees ───────────────────────────────────────────────
//
// tools/list:
//   "Get current stock level for a product SKU. [Cache-Control: no-store]"
//   "Create a new customer order. Validates stock availability. [Cache-Control: no-store]"
//   "List all product categories. [Cache-Control: immutable]"
//
// After orders.create succeeds:
//   [System: Cache invalidated for inventory.*, orders.*, products.* — caused by orders.create]
//
// Next time the LLM needs stock levels, it MUST call inventory.getStock
// again rather than relying on any previously seen stock count.
