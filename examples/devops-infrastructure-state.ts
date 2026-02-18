/**
 * Example: DevOps Infrastructure State Protection
 *
 * Scenario: An LLM-powered DevOps assistant manages cloud infrastructure
 * — EC2 instances, RDS databases, security groups, and deployments —
 * via MCP tools connected to the AWS API.
 *
 * The Danger Without StateSync:
 *
 *   Turn 1: LLM reads instances.list() → 4 instances running
 *   Turn 2: Auto-scaling group terminates 2 instances due to low traffic
 *   Turn 3: Operator asks "Scale our API to handle the traffic spike"
 *   Turn 4: LLM sees 4 instances from Turn 1, thinks capacity is sufficient
 *   Result: OUTAGE — only 2 instances exist, but LLM took no action
 *
 * Even worse with writes:
 *
 *   Turn 1: LLM reads securityGroups.get("sg-prod") → allows port 443 only
 *   Turn 2: Another engineer adds port 22 for maintenance
 *   Turn 3: LLM is asked to "clean up security rules"
 *   Turn 4: LLM overwrites the security group with Turn 1 data
 *   Result: PRODUCTION BREAK — port 22 rule silently removed
 *
 * With StateSync, infrastructure state is always `no-store`. Mutations to
 * instances, security groups, or deployments invalidate the infrastructure
 * domain, forcing the LLM to re-read current state before acting.
 *
 * Run: npx tsx examples/devops-infrastructure-state.ts
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StateSync } from '@vinkius-core/mcp-state-sync';

const server = new Server({ name: 'devops-assistant', version: '1.0.0' }, {
    capabilities: { tools: {} },
});

// ── StateSync Configuration ─────────────────────────────────────────
//
// Design principle: Cloud infrastructure is inherently dynamic.
// Auto-scaling, health checks, other engineers, CI/CD pipelines, and
// external events (spot instance termination) constantly change state.
// The LLM must NEVER assume infrastructure state from previous reads.
//
// Only AWS region metadata and service quotas are stable enough to cache.

const sync = new StateSync({
    defaults: { cacheControl: 'no-store' },
    policies: [
        // ── Reference data (AWS region/service info is stable) ──────
        { match: 'regions.*',      cacheControl: 'immutable' },
        { match: 'services.list',  cacheControl: 'immutable' },

        // ── Instance management ─────────────────────────────────────
        {
            match: 'instances.launch',
            invalidates: [
                'instances.*',     // Instance list changed
                'autoscaling.*',   // ASG state may update
                'costs.*',         // Running cost changed
            ],
        },
        {
            match: 'instances.terminate',
            invalidates: [
                'instances.*',
                'autoscaling.*',
                'loadBalancers.*', // Target group membership changed
                'costs.*',
            ],
        },

        // ── Security group mutations ────────────────────────────────
        {
            match: 'securityGroups.addRule',
            invalidates: ['securityGroups.*', 'instances.*'],
        },
        {
            match: 'securityGroups.removeRule',
            invalidates: ['securityGroups.*', 'instances.*'],
        },

        // ── Deployment operations ───────────────────────────────────
        {
            match: 'deployments.create',
            invalidates: [
                'deployments.*',   // Deployment log is stale
                'instances.*',     // Instance versions may change
                'services.*',      // Service status updated
            ],
        },
        {
            match: 'deployments.rollback',
            invalidates: [
                'deployments.*',
                'instances.*',
                'services.*',
            ],
        },

        // ── Database operations ─────────────────────────────────────
        {
            match: 'databases.createSnapshot',
            invalidates: ['databases.*', 'snapshots.*'],
        },
        {
            match: 'databases.modifyInstance',
            invalidates: ['databases.*', 'costs.*'],
        },

        // ── Everything else: no-store ───────────────────────────────
        // instances.list, securityGroups.get, costs.estimate, etc.
        // All require fresh reads — infrastructure state is ephemeral
    ],
});

sync.attachToServer(server, {
    tools: [
        {
            name: 'instances.list',
            description: 'List all EC2 instances with current status.',
            inputSchema: {
                type: 'object',
                properties: {
                    filters: {
                        type: 'object',
                        properties: {
                            status: { type: 'string', enum: ['running', 'stopped', 'terminated'] },
                            tag: { type: 'string' },
                        },
                    },
                },
            },
        },
        {
            name: 'instances.launch',
            description: 'Launch a new EC2 instance.',
            inputSchema: {
                type: 'object',
                properties: {
                    instanceType: { type: 'string' },
                    ami: { type: 'string' },
                    securityGroup: { type: 'string' },
                    count: { type: 'number' },
                },
                required: ['instanceType', 'ami'],
            },
        },
        {
            name: 'securityGroups.get',
            description: 'Get a security group with all inbound/outbound rules.',
            inputSchema: {
                type: 'object',
                properties: { groupId: { type: 'string' } },
                required: ['groupId'],
            },
        },
        {
            name: 'deployments.create',
            description: 'Deploy a new version to the specified service.',
            inputSchema: {
                type: 'object',
                properties: {
                    service: { type: 'string' },
                    version: { type: 'string' },
                    strategy: { type: 'string', enum: ['rolling', 'blue-green', 'canary'] },
                },
                required: ['service', 'version'],
            },
        },
        {
            name: 'regions.list',
            description: 'List all available AWS regions.',
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
//   "List all EC2 instances with current status. [Cache-Control: no-store]"
//   "Launch a new EC2 instance. [Cache-Control: no-store]"
//   "Get a security group with all inbound/outbound rules. [Cache-Control: no-store]"
//   "Deploy a new version to the specified service. [Cache-Control: no-store]"
//   "List all available AWS regions. [Cache-Control: immutable]"
//
// After deployments.create succeeds:
//   [System: Cache invalidated for deployments.*, instances.*, services.* — caused by deployments.create]
//
// After securityGroups.removeRule succeeds:
//   [System: Cache invalidated for securityGroups.*, instances.* — caused by securityGroups.removeRule]
//
// The LLM can no longer silently overwrite a security group with stale
// rules — it is explicitly told that the security group data it previously
// read has been invalidated and must be re-fetched.
