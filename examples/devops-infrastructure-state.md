# DevOps Infrastructure State Protection

> How `mcp-state-sync` prevents outages and silent security rule deletion in LLM-powered DevOps assistants.

---

## The Scenario

An LLM-powered DevOps assistant manages cloud infrastructure — EC2 instances, RDS databases, security groups, and deployments — via MCP tools connected to the AWS API. Cloud infrastructure is inherently dynamic: auto-scaling groups launch and terminate instances, health checks modify target groups, CI/CD pipelines deploy new versions, and other engineers make manual changes simultaneously.

## The Dangers

### Danger 1: Stale Instance Count → Missed Scaling

```
Turn 1: LLM reads instances.list()
        → Response: 4 instances running (api-1, api-2, api-3, api-4)

Turn 2: Auto-scaling group terminates api-3 and api-4 (low traffic period)
        → Real state: 2 instances running
        → The LLM has no visibility into auto-scaling events

Turn 3: Operator: "We're expecting a traffic spike. Do we need to scale up?"
        → LLM checks context: "4 instances running" (Turn 1)
        → LLM responds: "You have 4 instances — capacity looks sufficient."
        → No scaling action taken

Turn 4: Traffic spike hits 2 instances
        → OUTAGE — insufficient capacity
```

### Danger 2: Stale Security Groups → Silent Rule Deletion

```
Turn 1: LLM reads securityGroups.get("sg-prod")
        → Rules: [{ port: 443, source: "0.0.0.0/0" }]

Turn 2: Network engineer adds SSH access for maintenance:
        → Adds rule: { port: 22, source: "10.0.0.0/8" }
        → The LLM doesn't observe this change

Turn 3: Operator: "Clean up the security group, remove anything we don't need"
        → LLM reads from context: only port 443 exists (Turn 1)
        → LLM calls securityGroups.update("sg-prod", rules: [{ port: 443 }])
        → Port 22 rule SILENTLY DELETED

Turn 4: Network engineer loses SSH access to production
        → Debugging begins... "who removed the SSH rule?"
```

This is the most insidious form of Causal State Drift: the LLM doesn't just miss information — it actively **overwrites concurrent changes** with stale data. The security rule deletion is syntactically correct, logically justified by the LLM's context, and completely invisible until someone tries to SSH.

### Danger 3: Stale Deployment State → Accidental Rollback

```
Turn 1: LLM reads deployments.list("api-service")
        → Latest: v2.3.0 (deployed 2 hours ago)

Turn 2: CI/CD pipeline deploys v2.4.0 (hotfix for critical bug)
        → Current version: v2.4.0

Turn 3: Operator: "The API seems slow, roll back to the previous stable version"
        → LLM's context shows v2.3.0 as "latest"
        → LLM infers "previous stable" is v2.2.0
        → Rolls back to v2.2.0, skipping the v2.4.0 hotfix entirely

Turn 4: Critical bug (fixed in v2.4.0) is reintroduced
```

## How StateSync Solves This

### Static signal — infrastructure state is always `no-store`

```
name: "instances.list"
description: "List all EC2 instances with current status. [Cache-Control: no-store]"

name: "securityGroups.get"
description: "Get a security group with all inbound/outbound rules. [Cache-Control: no-store]"
```

Every infrastructure read tool carries `[Cache-Control: no-store]`. The LLM learns that cloud state is inherently volatile and must never be assumed from previous reads.

### Dynamic signal — mutations explicitly invalidate infrastructure domains

When `instances.launch` succeeds:

```
Content Block 0:
  [System: Cache invalidated for instances.*, autoscaling.*, costs.* — caused by instances.launch]

Content Block 1:
  {"ok": true, "instance_id": "i-0a1b2c3d4e5f6", "status": "pending"}
```

When `securityGroups.addRule` succeeds:

```
Content Block 0:
  [System: Cache invalidated for securityGroups.*, instances.* — caused by securityGroups.addRule]

Content Block 1:
  {"ok": true, "rule_id": "sgr-0x1y2z"}
```

### Why `instances.*` is invalidated by security group changes

Instances reference security groups. When a security group rule changes, the effective network policy of every instance in that group changes. If the LLM cached an instance's "security: port 443 only" from a previous read, that data is now stale.

Coarse-grained invalidation catches this cross-resource dependency without building an explicit dependency graph.

## Policy Configuration

```typescript
const sync = new StateSync({
    defaults: { cacheControl: 'no-store' },
    policies: [
        // Reference data (AWS regions and service catalog are stable)
        { match: 'regions.*',      cacheControl: 'immutable' },
        { match: 'services.list',  cacheControl: 'immutable' },

        // Instance launches and terminations
        {
            match: 'instances.launch',
            invalidates: ['instances.*', 'autoscaling.*', 'costs.*'],
        },
        {
            match: 'instances.terminate',
            invalidates: ['instances.*', 'autoscaling.*', 'loadBalancers.*', 'costs.*'],
        },

        // Security group mutations
        {
            match: 'securityGroups.addRule',
            invalidates: ['securityGroups.*', 'instances.*'],
        },
        {
            match: 'securityGroups.removeRule',
            invalidates: ['securityGroups.*', 'instances.*'],
        },

        // Deployments
        {
            match: 'deployments.create',
            invalidates: ['deployments.*', 'instances.*', 'services.*'],
        },
        {
            match: 'deployments.rollback',
            invalidates: ['deployments.*', 'instances.*', 'services.*'],
        },

        // Database operations
        {
            match: 'databases.createSnapshot',
            invalidates: ['databases.*', 'snapshots.*'],
        },
        {
            match: 'databases.modifyInstance',
            invalidates: ['databases.*', 'costs.*'],
        },

        // Everything else: no-store (default)
    ],
});
```

### Why `costs.*` is invalidated by instance and database operations

Running costs change immediately when instances are launched, terminated, or database configurations are modified. If the LLM cached a cost estimate, it must re-read after any infrastructure mutation to avoid quoting incorrect cost information.

### Why `loadBalancers.*` is invalidated by `instances.terminate`

Terminating an instance may remove it from a target group, changing the load balancer's routing behavior. If the LLM cached load balancer state showing 4 healthy targets, it must re-read to discover only 2 remain.

## Complete Code Example

→ See [`devops-infrastructure-state.ts`](./devops-infrastructure-state.ts)
