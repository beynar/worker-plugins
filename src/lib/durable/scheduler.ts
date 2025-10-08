import cronParser from 'cron-parser';
import { parse, stringify } from '../json';
import { getHandler } from '../rpc/handler';
import { AnyRouter } from '../rpc/router';
import { API, createApi } from '../rpc/api';
import { date, number, object, optional, string, union } from 'zod/mini';
import { DurableServer } from './object';
import { ScheduleRequestEvent } from '../rpc/requestEvent';

export type RawTask = {
	id: string;
	description?: string | undefined;
	payload?: Record<string, unknown> | undefined;
	handler: string;
} & (
	| {
			time: Date;
			type: 'scheduled';
	  }
	| {
			delayInSeconds: number;
			type: 'delayed';
	  }
	| {
			cron: string;
			type: 'cron';
	  }
);

export type RawTaskPayload = {
	description?: string | undefined;
	payload?: any;
	handler: string;
} & (
	| {
			time: Date;
			type: 'scheduled';
	  }
	| {
			delayInSeconds: number;
			type: 'delayed';
	  }
	| {
			cron: string;
			type: 'cron';
	  }
);

export type Task = RawTask & {
	time: Date;
};

export type SqlTask = {
	id: string;
	description: string | null;
	payload: string | null;
	handler: string;
	retryCount: number;
	lastError: string | null;
	createdAt: number;
} & (
	| {
			type: 'scheduled';
			time: number;
	  }
	| {
			type: 'delayed';
			time: number;
			delayInSeconds: number;
	  }
	| {
			type: 'cron';
			time: number;
			cron: string;
	  }
);
const options = union([
	object({ at: date(), in: optional(number()), cron: optional(string()) }),
	object({ in: number(), at: optional(date()), cron: optional(string()) }),
	object({ cron: string(), at: optional(date()), in: optional(number()) }),
]);

export type TASK_API<TASKS extends AnyRouter | undefined = undefined> = TASKS extends AnyRouter ? API<TASKS, typeof options> : undefined;

export class Scheduler<Tasks extends AnyRouter | undefined = undefined> {
	storage: DurableObjectStorage;
	private server: DurableServer<any, Tasks, any, any>;

	constructor(server: DurableServer<any, Tasks, any, any>) {
		this.server = server;
		this.storage = server.ctx.storage;
		this.server.schedule = createApi({
			router: server.tasks,
			callback: async ({ handler, data, path, type, opts }) => {
				if (opts.at) {
					await this.scheduleTask({
						type: 'scheduled',
						time: opts.at,
						handler: path.join('.'),
						payload: data,
					});
				} else if (opts.in) {
					await this.scheduleTask({
						type: 'delayed',
						delayInSeconds: opts.in,
						handler: path.join('.'),
						payload: data,
					});
				} else if (opts.cron) {
					await this.scheduleTask({
						type: 'cron',
						cron: opts.cron,
						handler: path.join('.'),
						payload: data,
					});
				}
			},
			options,
		});
	}

	init = async () => {
		// Create tasks table if it doesn't exist
		this.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        description TEXT,
        payload TEXT,
        type TEXT NOT NULL CHECK(type IN ('scheduled', 'delayed', 'cron', 'no-schedule')),
        time INTEGER,
        delayInSeconds INTEGER,
        handler TEXT NOT NULL,
        cron TEXT,
        retryCount INTEGER DEFAULT 0,
        lastError TEXT,
        createdAt INTEGER DEFAULT (unixepoch())
      )
    `);
		// execute any pending tasks and schedule the next alarm
		await this.alarm();
	};

	getAllTasks = () => {
		return this.storage.sql.exec<SqlTask>('SELECT * FROM tasks').toArray();
	};

	private async scheduleNextAlarm() {
		// Find the next task that needs to be executed
		const query = `
      SELECT time FROM tasks
      WHERE time > ?
      AND type != 'no-schedule'
      ORDER BY time ASC
      LIMIT 1
    `;
		const [result] = this.storage.sql.exec<SqlTask>(query, [Math.floor(Date.now() / 1000)]).toArray();
		if (!result || !result.time) return;

		await this.storage.setAlarm(result.time * 1000);
	}

	async scheduleTask(task: RawTaskPayload): Promise<string> {
		const { description = null, payload = null, handler } = task;
		const id = crypto.randomUUID();

		if ('time' in task && task.time) {
			const timestamp = Math.floor(task.time.getTime() / 1000);
			const query = `
        INSERT OR REPLACE INTO tasks (id, description, payload, type, time, handler)
        VALUES (?, ?, ?, 'scheduled', ?, ?)
      `;
			this.storage.sql.exec(query, [id, description, stringify(payload), timestamp, handler]);

			await this.scheduleNextAlarm();
		} else if ('delayInSeconds' in task && task.delayInSeconds) {
			const time = new Date(Date.now() + task.delayInSeconds * 1000);
			const timestamp = Math.floor(time.getTime() / 1000);
			const query = `
        INSERT OR REPLACE INTO tasks (id, description, payload, type, delayInSeconds, time, handler)
        VALUES (?, ?, ?, 'delayed', ?, ?, ?)
      `;
			this.storage.sql.exec(query, [id, description, stringify(payload), task.delayInSeconds, timestamp, handler]);

			await this.scheduleNextAlarm();
		} else if ('cron' in task && task.cron) {
			// Validate cron expression - this will throw if invalid
			try {
				cronParser.parse(task.cron);
			} catch (error) {
				throw new Error(`Invalid cron expression: ${task.cron}`);
			}
			const nextExecutionTime = this.getNextCronTime(task.cron);
			const timestamp = Math.floor(nextExecutionTime.getTime() / 1000);
			const query = `
        INSERT OR REPLACE INTO tasks (id, description, payload, type, cron, time, handler)
        VALUES (?, ?, ?, 'cron', ?, ?, ?)
      `;
			this.storage.sql.exec(query, [id, description, stringify(payload), task.cron, timestamp, handler]);
			await this.scheduleNextAlarm();
		}
		return id;
	}

	async alarm(): Promise<void> {
		const now = Math.floor(Date.now() / 1000);

		// Get all tasks that should be executed now
		const tasks = this.storage.sql.exec<SqlTask>('SELECT * FROM tasks WHERE time <= ?', [now]).toArray();

		await this.server.invokePlugins('onAlarm', {
			server: this.server,
		});

		for (const row of tasks || []) {
			const task = this.rowToTask(row);
			const success = await this.executeTask(task);

			if (task.type === 'cron') {
				// For cron tasks: always schedule next occurrence, regardless of success
				// The cron schedule itself is the retry mechanism
				const nextExecutionTime = this.getNextCronTime(task.cron);
				const nextTimestamp = Math.floor(nextExecutionTime.getTime() / 1000);
				const errorMessage = success ? null : `Last execution failed at ${new Date().toISOString()}`;
				this.storage.sql.exec('UPDATE tasks SET time = ?, lastError = ? WHERE id = ?', [nextTimestamp, errorMessage, task.id]);
			} else {
				// For scheduled/delayed tasks
				if (success) {
					// Delete after successful execution
					this.storage.sql.exec('DELETE FROM tasks WHERE id = ?', [task.id]);
				} else {
					// Handle retry logic
					const currentRetryCount = row.retryCount;
					const newRetryCount = currentRetryCount + 1;

					if (newRetryCount >= 5) {
						// Max retries reached - delete task
						console.error(`Task ${task.id} failed after 5 retries. Deleting.`);
						this.storage.sql.exec('DELETE FROM tasks WHERE id = ?', [task.id]);
					} else {
						// Exponential backoff: 4^retryCount seconds (4s, 16s, 64s, 256s, 1024s)
						const backoffSeconds = Math.pow(4, newRetryCount);
						const retryTime = Math.floor(Date.now() / 1000) + backoffSeconds;

						console.log(`Retry ${newRetryCount}/5 for task ${task.id} in ${backoffSeconds}s`);

						// Update task with new retry count and time
						this.storage.sql.exec('UPDATE tasks SET retryCount = ?, lastError = ?, time = ? WHERE id = ?', [
							newRetryCount,
							row.lastError || 'Execution failed',
							retryTime,
							task.id,
						]);
					}
				}
			}
		}

		// Schedule the next alarm
		await this.scheduleNextAlarm();
	}

	private rowToTask(row: SqlTask): Task {
		const base = {
			id: row.id,
			description: row.description,
			payload: row.payload ? (parse(row.payload) as Record<string, unknown>) : undefined,
			handler: row.handler,
		} as RawTask;

		switch (row.type) {
			case 'scheduled':
				return {
					...base,
					time: new Date(row.time * 1000),
					type: 'scheduled',
				};
			case 'delayed':
				return {
					...base,
					delayInSeconds: row.delayInSeconds,
					time: new Date(row.time * 1000),
					type: 'delayed',
				};
			case 'cron':
				return {
					...base,
					cron: row.cron,
					time: new Date(row.time * 1000),
					type: 'cron',
				};
			default:
				// @ts-expect-error expected wrong type
				throw new Error(`Unknown task type: ${row.type as string}`);
		}
	}

	private async executeTask(task: Task): Promise<boolean> {
		console.log(`Executing task ${task.id}:`, task);

		try {
			const { handler: handlerPath } = task;
			const handler = getHandler(this.server.tasks, handlerPath.split('.'), true);
			const event: ScheduleRequestEvent = {
				server: this.server,
			};
			await handler.call(event, task.payload);
			return true;
		} catch (error) {
			console.error('Failed to execute task', task, error);
			return false;
		}
	}

	private getNextCronTime(cronExpression: string): Date {
		const interval = cronParser.parse(cronExpression);
		return interval.next().toDate();
	}

	async query(
		criteria: {
			description?: string;
			id?: string;
			type?: 'scheduled' | 'delayed' | 'cron' | 'no-schedule';
			timeRange?: { start?: Date; end?: Date };
		} = {}
	): Promise<Task[]> {
		let query = 'SELECT * FROM tasks WHERE 1=1';
		const params: (string | number | boolean | null)[] = [];

		if (criteria.id) {
			query += ' AND id = ?';
			params.push(criteria.id);
		}

		if (criteria.description) {
			query += ' AND description = ?';
			params.push(criteria.description);
		}

		if (criteria.type) {
			query += ' AND type = ?';
			params.push(criteria.type);
		}

		if (criteria.timeRange) {
			query += ' AND time >= ? AND time <= ?';
			const start = criteria.timeRange.start || new Date(0);
			const end = criteria.timeRange.end || new Date(999999999999999);
			params.push(Math.floor(start.getTime() / 1000), Math.floor(end.getTime() / 1000));
		}

		const results = this.storage.sql.exec<SqlTask>(query, params).toArray();
		return results?.map((row) => this.rowToTask(row)) || [];
	}

	async cancelTask(id: string): Promise<boolean> {
		this.storage.sql.exec('DELETE FROM tasks WHERE id = ?', [id]);
		await this.scheduleNextAlarm();
		return true;
	}
}
