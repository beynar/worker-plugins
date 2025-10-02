# Scheduler

A robust task scheduling system for Cloudflare Durable Objects with support for one-time, delayed, and recurring (cron) tasks.

## Features

- **Three scheduling types**: scheduled (at specific time), delayed (after X seconds), and cron (recurring)
- **Persistent storage**: Tasks survive Durable Object hibernation/eviction
- **Automatic retries**: Exponential backoff (4^n seconds: 4s, 16s, 64s, 256s, 1024s) for failed tasks
- **Max retry limit**: Tasks are deleted after 5 failed attempts
- **Cron resilience**: Recurring tasks always schedule their next occurrence, even after failures
- **Type-safe API**: Full TypeScript support with typed task handlers

## Usage

### Basic Setup

```typescript
import { DurableServer } from './object';
import { router } from './router';

// Define your task handlers
const tasks = router({
  sendEmail: async (ctx, payload: { to: string; subject: string }) => {
    await sendEmail(payload.to, payload.subject);
  },
  cleanupOldData: async (ctx) => {
    await database.cleanup();
  }
});

// Scheduler is automatically initialized in DurableServer
class MyDurableObject extends DurableServer<typeof tasks> {
  tasks = tasks;
}
```

### Scheduling Tasks

#### Schedule at Specific Time

```typescript
// Schedule a task to run at a specific date/time
await server.schedule.sendEmail(
  { to: 'user@example.com', subject: 'Hello' },
  { at: new Date('2024-12-31T23:59:59Z') }
);
```

#### Delayed Execution

```typescript
// Schedule a task to run after a delay (in seconds)
await server.schedule.sendEmail(
  { to: 'user@example.com', subject: 'Reminder' },
  { in: 3600 } // 1 hour from now
);
```

#### Recurring (Cron)

```typescript
// Schedule a recurring task using cron syntax
await server.schedule.cleanupOldData(
  {},
  { cron: '0 0 * * *' } // Every day at midnight
);
```

## Retry Behavior

### One-Time & Delayed Tasks

When a scheduled or delayed task fails:

1. **First failure**: Retries after 4 seconds
2. **Second failure**: Retries after 16 seconds (4²)
3. **Third failure**: Retries after 64 seconds (4³)
4. **Fourth failure**: Retries after 256 seconds (4⁴)
5. **Fifth failure**: Retries after 1024 seconds (4⁵)
6. **After 5 failures**: Task is permanently deleted

### Cron Tasks

Cron tasks have different behavior:

- **Always schedule next occurrence**, regardless of success/failure
- Failures are logged in `lastError` field but don't prevent future executions
- The recurring nature of cron acts as the retry mechanism
- Never deleted due to failures

## API Reference

### `scheduleTask(task: RawTaskPayload): Promise<string>`

Manually schedule a task. Returns the task ID.

```typescript
const taskId = await scheduler.scheduleTask({
  type: 'scheduled',
  time: new Date('2024-12-25T00:00:00Z'),
  handler: 'sendEmail',
  payload: { to: 'santa@northpole.com', subject: 'Merry Christmas!' },
  description: 'Christmas greeting'
});
```

### `getAllTasks(): SqlTask[]`

Get all scheduled tasks.

```typescript
const tasks = scheduler.getAllTasks();
console.log(`${tasks.length} tasks scheduled`);
```

### `query(criteria): Promise<Task[]>`

Query tasks with filters.

```typescript
// Get all cron tasks
const cronTasks = await scheduler.query({ type: 'cron' });

// Get tasks in a time range
const upcomingTasks = await scheduler.query({
  timeRange: {
    start: new Date(),
    end: new Date(Date.now() + 86400000) // Next 24 hours
  }
});

// Get a specific task
const task = await scheduler.query({ id: 'task-uuid' });
```

### `cancelTask(id: string): Promise<boolean>`

Cancel a scheduled task.

```typescript
await scheduler.cancelTask('task-uuid');
```

## Database Schema

Tasks are stored in a SQL table with the following structure:

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  description TEXT,
  payload TEXT,                    -- JSON stringified
  type TEXT NOT NULL,              -- 'scheduled' | 'delayed' | 'cron'
  time INTEGER,                    -- Unix timestamp (seconds)
  delayInSeconds INTEGER,          -- Original delay for 'delayed' tasks
  handler TEXT NOT NULL,           -- Handler path (e.g., 'sendEmail')
  cron TEXT,                       -- Cron expression for recurring tasks
  retryCount INTEGER DEFAULT 0,    -- Number of retry attempts
  lastError TEXT,                  -- Last error message (if any)
  createdAt INTEGER DEFAULT (unixepoch())
)
```

## Cron Expression Format

Uses standard cron syntax:

```
┌────────────── second (optional, 0-59)
│ ┌──────────── minute (0-59)
│ │ ┌────────── hour (0-23)
│ │ │ ┌──────── day of month (1-31)
│ │ │ │ ┌────── month (1-12)
│ │ │ │ │ ┌──── day of week (0-7, 0 and 7 = Sunday)
│ │ │ │ │ │
* * * * * *
```

### Examples

```typescript
'0 * * * *'      // Every hour
'0 0 * * *'      // Every day at midnight
'0 9 * * 1-5'    // Every weekday at 9 AM
'*/15 * * * *'   // Every 15 minutes
'0 0 1 * *'      // First day of every month
```

## Error Handling

### Handler Errors

If a task handler throws an error:

```typescript
tasks = router({
  riskyTask: async (ctx, payload) => {
    throw new Error('Something went wrong');
  }
});
```

- Error is logged to console
- Task enters retry logic (for non-cron tasks)
- Error message stored in `lastError` field

### Invalid Cron Expressions

Cron expressions are validated when scheduling:

```typescript
try {
  await server.schedule.task({}, { cron: 'invalid cron' });
} catch (error) {
  console.error(error); // "Invalid cron expression: invalid cron"
}
```

## Implementation Details

### Alarm-Based Execution

The scheduler uses Cloudflare Durable Object alarms:

1. When a task is scheduled, the alarm is set to the earliest upcoming task
2. When the alarm fires, all due tasks are executed
3. After execution, the next alarm is automatically scheduled

### Concurrency

Tasks are executed **sequentially** to avoid race conditions:

```typescript
for (const task of dueTasks) {
  await executeTask(task); // Waits for each task to complete
}
```

### State Persistence

All task state is stored in Durable Object SQL storage:

- Survives object hibernation
- Persists across restarts
- Queryable and debuggable

## Best Practices

1. **Keep handlers idempotent**: Tasks may retry, so handlers should be safe to run multiple times
2. **Use descriptive names**: Add descriptions to tasks for debugging
3. **Monitor lastError**: Check the `lastError` field to identify recurring problems
4. **Clean up old cron tasks**: Remove cron tasks that are no longer needed
5. **Validate payloads**: Ensure task payloads match handler expectations

## Limitations

- Maximum retry attempts: 5 (hardcoded)
- Cron tasks never deleted automatically
- No priority system (tasks execute in time order)
- Sequential execution only (no parallel task execution)
