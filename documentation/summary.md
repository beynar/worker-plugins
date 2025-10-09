# Worker-Plugins: Simple Type-Safe Cloudflare Workers Foundation

## Package Overview

**Worker-Plugins** is a lightweight TypeScript foundation that makes Cloudflare Workers development simple and extensible. Built around a powerful RPC core mechanism, it provides the essential building blocks for distributed serverless applications while maintaining infinite extensibility through its plugin architecture.

## Core Goal

The framework provides a **foundational architecture** that makes it simple to extend Cloudflare Workers applications. By offering essential building blocks with a chainable API, it eliminates boilerplate while enabling infinite extensibility through a plugin system that leverages the core services.

## Key Features

### 1. Simple Chainable API
- **Intuitive method chaining** for defining Workers and Durable Objects
- **Minimal boilerplate** - get started with just a few lines of code
- **Familiar patterns** that feel like traditional server development
- **Type-safe throughout** with automatic inference

### 2. Essential Built-in Services
- **Type-safe RPC communication** between Workers and Durable Objects
- **WebSocket management** with presence tracking and reconnection
- **Task scheduling** with cron support and automatic retries
- **Synchronous KV storage** with namespace support

### 3. Plugin Architecture
- **Extensible foundation** that plugins can build upon
- **Type-safe plugin APIs** with full TypeScript support
- **Composable plugin system** for modular functionality
- **Infinite extensibility** while maintaining core simplicity

### 4. Developer Experience
- **Type-safe client SDK** for external applications
- **Zero-configuration setup** - works out of the box
- **Comprehensive TypeScript support** with automatic inference
- **Production-ready features** built-in

## Architecture Components

### Worker Layer
```typescript
const worker = createWorker()
  .router((t) => ({
    // HTTP endpoint procedures
    users: {
      get: t.input(schema).handle(handler),
      create: t.input(schema).handle(handler)
    }
  }))
  .object('MY_DURABLE_OBJECT', MyDurableObject) // Register Durable Objects
```

### Durable Object Layer
```typescript
export class MyDurableObject extends createDurableObject(...plugins) {
  // HTTP procedures
  router = { /* procedures */ };

  // WebSocket output procedures
  ws_out = { /* real-time procedures */ };

  // WebSocket input handlers
  ws_in = { /* incoming message handlers */ };

  // Scheduled tasks
  tasks = { /* cron/background jobs */ };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Auto-initialized: KV storage, WebSocket manager, Scheduler
  }
}
```

### Client Layer
```typescript
const client = createClient<WorkerInfer>({
  endpoint: 'https://my-worker.com'
});

// Call Worker procedures
const result = await client.users.get({ id: 123 });

// Call Durable Object procedures
const doResult = await client.MY_DURABLE_OBJECT().users.get({ id: 123 });

// Connect to WebSocket
const ws = client.MY_DURABLE_OBJECT().connect({
  handlers: {
    onMessage: (data) => console.log(data)
  }
});
```

## Built-in Services

Worker-Plugins includes essential services that every application needs:

- **Type-safe RPC** - Seamless communication between Workers and Durable Objects
- **WebSocket management** - Real-time features with presence tracking
- **Task scheduling** - Background jobs with cron support and retries
- **KV storage** - Simple key-value storage with namespaces

These services are designed to be **foundational** - simple enough for basic use cases, powerful enough for complex applications, and extensible through plugins.

## Extensibility Through Plugins

The plugin architecture allows you to extend functionality while maintaining the simple core:

```typescript
const worker = createWorker()
  .use(authPlugin)        // Add authentication
  .use(rateLimitPlugin)   // Add rate limiting
  .use(cachePlugin)       // Add caching
  .router((t) => ({
    // Your application logic
  }));
```

## Use Cases

This foundation enables:

- **Real-time applications** (chat, live dashboards, gaming)
- **API platforms** with type-safe client libraries
- **Background processing** systems with reliable task scheduling
- **Microservices architectures** on Cloudflare's edge
- **Collaborative platforms** with real-time features

## Why Worker-Plugins?

Traditional Cloudflare Workers development requires:
- Manual Durable Object ID management
- Complex WebSocket setup
- Boilerplate for task scheduling
- No type safety across the stack

Worker-Plugins provides:
- **Foundational architecture** - simple to extend and build upon
- **Essential services built-in** - core features ready to use
- **Chainable API design** - intuitive and familiar patterns
- **Plugin extensibility** - infinite possibilities for customization

The result is a **simple foundation that enables infinite extensibility**.
