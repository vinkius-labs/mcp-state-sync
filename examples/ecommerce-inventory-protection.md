# E-Commerce Inventory Protection

> How `mcp-state-sync` prevents overselling and phantom stock in LLM-powered commerce assistants.

---

## The Scenario

An LLM-powered commerce assistant manages product catalog, inventory, orders, and pricing for an online store via MCP tools. The inventory is modified concurrently by multiple channels: website checkout, mobile app, point-of-sale terminals, marketplace integrations (Amazon, Shopify), and the AI assistant itself.

## The Danger

```
Turn 1: LLM reads inventory.getStock("SKU-7782")
        → Response: 3 units available

Turn 2: Customer buys 2 units via website checkout
        → Real inventory: 1 unit remaining
        → The LLM has no way to observe this transaction

Turn 3: Another customer asks the LLM: "Is the limited edition SKU-7782 still available?"
        → LLM checks context: "3 units available" (Turn 1)
        → LLM responds: "Yes! We have 3 in stock."
        → Customer: "Great, I'll take all 3."

Turn 4: LLM calls orders.create({ sku: "SKU-7782", quantity: 3 })
        → Database: only 1 unit exists
        → OVERSELL — 2 phantom units sold
```

The failure cascades:
- Customer receives an order confirmation for 3 units
- Warehouse can only ship 1 unit
- Customer support must handle the discrepancy
- Customer trust is damaged
- If this is a marketplace order (Amazon), the seller's account health degrades

### The Self-Mutation Variant

Even worse, the LLM can cause Causal State Drift through its own actions:

```
Turn 1: LLM reads inventory.getStock("SKU-7782") → 3 units
Turn 2: LLM creates order for 2 units → succeeds, real stock is now 1
Turn 3: LLM is asked about availability → sees "3 units" from Turn 1
Turn 4: LLM promises availability of 3 more units → OVERSELL
```

The LLM's own write at Turn 2 changed the world, but its context still contains the stale read from Turn 1. Without an explicit invalidation signal, the model has no mechanism to detect that its own action made its earlier data obsolete.

## How StateSync Solves This

### Static signal for reads

```
name: "inventory.getStock"
description: "Get current stock level for a product SKU. [Cache-Control: no-store]"
```

The `no-store` directive signals that inventory data must never be reused from context. Before quoting availability, the LLM must call `inventory.getStock` again.

### Dynamic signal for writes

When `orders.create` succeeds:

```
Content Block 0:
  [System: Cache invalidated for inventory.*, orders.*, products.* — caused by orders.create]

Content Block 1:
  {"ok": true, "order_id": "ORD-44821", "items_reserved": 2}
```

This creates an explicit causal chain:
1. "I just created an order"
2. "That order consumed inventory"
3. "My previously read inventory levels are now invalid"
4. "I must call `inventory.getStock` before making any availability promises"

### Reference data is `immutable`

Product categories, shipping zones, and tax rates are stable within a commerce session:

```
name: "categories.list"
description: "List all product categories. [Cache-Control: immutable]"
```

The LLM can reference "Electronics > Audio > Headphones" from its context without re-reading — the category taxonomy hasn't changed.

## Policy Configuration

```typescript
const sync = new StateSync({
    defaults: { cacheControl: 'no-store' },
    policies: [
        // Reference data
        { match: 'categories.*',   cacheControl: 'immutable' },
        { match: 'shipping.zones', cacheControl: 'immutable' },
        { match: 'taxes.rates',    cacheControl: 'immutable' },

        // Order creation: the most critical write
        {
            match: 'orders.create',
            invalidates: [
                'inventory.*',     // Stock levels changed
                'orders.*',        // Order list is stale
                'products.*',      // Product "in stock" status may change
            ],
        },

        // Order cancellation reverses inventory impact
        {
            match: 'orders.cancel',
            invalidates: [
                'inventory.*',     // Stock returned to warehouse
                'orders.*',        // Order status changed
            ],
        },

        // Price updates affect product data and cart totals
        {
            match: 'products.updatePrice',
            invalidates: ['products.*', 'cart.*'],
        },

        // Inventory adjustments (manual restock, warehouse receiving)
        {
            match: 'inventory.adjust',
            invalidates: ['inventory.*', 'products.*'],
        },

        // Everything else: no-store (default)
    ],
});
```

### Why `products.*` is invalidated by `orders.create`

When inventory drops to zero, the product's availability status changes from "In Stock" to "Out of Stock." If the LLM cached a `products.getDetails` response showing "In Stock: true," that data is now wrong.

By invalidating `products.*` alongside `inventory.*`, we ensure the LLM sees the updated availability status, not just the updated stock count.

## Complete Code Example

→ See [`ecommerce-inventory-protection.ts`](./ecommerce-inventory-protection.ts)
