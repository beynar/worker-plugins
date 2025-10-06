import { WorkerPlugin } from './plugin';
import { WorkerRequestEvent, AnyRouter, createRouter, Router, QueueRequestEvent } from '../rpc';
import { IfDefined, MaybePromise, UnionToIntersection } from '../utils/types';
import { any, object, string } from 'zod';
import { createDurableObject } from '../durable';
import { FLARERROR } from '../error';
import { Middleware } from '../rpc';

type BeforeFunction = (opts: { event: WorkerRequestEvent }) => MaybePromise<Response | void>;
type AfterFunction = (response: Response, opts: { event: WorkerRequestEvent }) => MaybePromise<Response | void>;
type CronFunction = () => MaybePromise<void>;
type ErrorFunction = (errorPayload: { error: FLARERROR; event: WorkerRequestEvent }) => MaybePromise<Response | void>;

type DurableObjectConstructor = new (ctx: DurableObjectState, env: Env) => any;

interface WorkerConfig {
	name?: string;
	router?: AnyRouter;
	queues?: AnyRouter;
	before?: BeforeFunction[];
	after?: AfterFunction[];
	onError?: ErrorFunction[];
	crons?: Record<string, CronFunction>;
	plugins?: WorkerPlugin[];
	objects?: Record<string, DurableObjectConstructor>;
}

type EnsureObjectType<T> = T extends Record<string, DurableObjectConstructor> ? T : never;

type Merge<T extends WorkerPlugin[], key extends keyof WorkerPlugin> = T extends [
	infer Head extends WorkerPlugin,
	...infer Tail extends WorkerPlugin[]
]
	? Head[key] extends undefined
		? Merge<Tail, key>
		: Head[key] | Merge<Tail, key>
	: T extends [infer Head extends WorkerPlugin]
	? Head[key]
	: never;

// type MergeMiddlewares<T extends WorkerPlugin[]> = T extends [infer Head extends WorkerPlugin, ...infer Tail extends WorkerPlugin[]]
// 	? Head['middleware'] extends undefined
// 		? MergeMiddlewares<Tail>
// 		: SafeReturnType<Head['middleware']> & MergeMiddlewares<Tail>
// 	: T extends [infer Head extends WorkerPlugin]
// 	? SafeReturnType<Head['middleware']>
// 	: never;

type MergeMiddlewares<T extends WorkerPlugin[], Acc extends Record<string, any> = {}> = T extends [
	infer Head extends WorkerPlugin,
	...infer Tail extends WorkerPlugin[]
]
	? Head['middleware'] extends Middleware<'worker' | 'queue'>
		? MergeMiddlewares<Tail, Acc & SafeReturnType<Head['middleware']>>
		: MergeMiddlewares<Tail, Acc>
	: Acc;

type MergeIntoObject<T extends WorkerPlugin[], key extends keyof WorkerPlugin, Acc extends Record<string, any> = {}> = T extends [
	infer Head extends WorkerPlugin,
	...infer Tail extends WorkerPlugin[]
]
	? Head[key] extends Record<string, any>
		? MergeIntoObject<Tail, key, Acc & Head[key]>
		: MergeIntoObject<Tail, key, Acc>
	: Acc;

type SafeReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

export const createWorker = <N extends string>(name?: N) => {
	return new Worker({ name });
};

class MyDurableObject extends createDurableObject()<MyDurableObject> {}

const t2 = createRouter('worker').use(() => {
	return {
		ok: true,
	};
});

t2.procedure()
	.input(object({}))
	.handle(({}) => {});
const worker = createWorker()
	.use({
		// middleware: () => {
		// 	return {
		// 		ok: true,
		// 	};
		// },
		expose: {
			test: () => {
				return 'hello';
			},
		},
	})
	.use({
		middleware: () => {
			return {
				caca: 'true',
			};
		},

		expose: {
			test2: () => {
				return 'hello';
			},
		},
	})
	.object('keyOfENV', MyDurableObject)
	.router((t) => ({
		test: t
			.input(
				object({
					streing: string(),
				})
			)
			.handle(({ input, event, ctx }) => {
				const t = ctx.test();
				return 'hello';
			}),
	}));

export class Worker<Config extends WorkerConfig = {}> {
	private config: Config;

	constructor(config: Config) {
		this.config = config;
	}

	private pluginsMiddleware = async (event: WorkerRequestEvent | QueueRequestEvent): Promise<this['~infer']['middleware']> => {
		return Promise.all(
			(this.config.plugins || []).reduce((acc, p) => {
				if (p.middleware) {
					const maybePromise = p.middleware(event);
					if (maybePromise instanceof Promise) {
						acc.push(maybePromise);
					}
				}

				return acc;
			}, [] as Promise<any>[])
		).then((acc) => {
			return acc.reduce((acc, plugin) => {
				return {
					...acc,
					...(plugin || {}),
				};
			}, {} as this['~infer']['middleware']);
		});
	};

	private get exposed() {
		return (this.config.plugins || []).reduce((acc, plugin) => {
			return {
				...acc,
				...(plugin.expose || {}),
			};
		}, {} as this['~infer']['exposed']);
	}

	get route() {
		return createRouter('worker')
			.use(this.pluginsMiddleware)
			.use(() => {
				return this.exposed;
			})
			.procedure();
	}
	get queue() {
		// This should returns createRouter("queue").procedure
		return createRouter('queue')
			.use(this.pluginsMiddleware)
			.use(() => {
				return this.exposed;
			})
			.procedure();
	}
	/**
	 * Add plugins to the worker
	 */
	use = <Plugins extends WorkerPlugin[]>(...plugins: Plugins) => {
		const newPlugins = [...(this.config.plugins || []), ...plugins] as [
			...(Config['plugins'] extends WorkerPlugin[] ? Config['plugins'] : []),
			...Plugins
		];
		return new Worker({
			...this.config,
			plugins: newPlugins,
		} as Omit<Config, 'plugins'> & {
			plugins: [...(Config['plugins'] extends WorkerPlugin[] ? Config['plugins'] : []), ...Plugins];
		});
	};

	/**
	 * Define or extend router endpoints
	 */
	router = <R>(fn: (t: typeof this.route) => R) => {
		const newRouter = fn(this.route);
		return new Worker({
			...this.config,
			router: {
				...(this.config.router || {}),
				...newRouter,
			},
		} as Config & { router: (Config['router'] extends AnyRouter ? Config['router'] : {}) & R });
	};

	/**
	 * Define or extend queue handlers
	 */
	queues = <Q>(fn: (t: typeof this.queue) => Q) => {
		const newQueues = fn(this.queue);
		return new Worker({
			...this.config,
			queues: {
				...(this.config.queues || {}),
				...newQueues,
			},
		} as Config & { queues: (Config['queues'] extends AnyRouter ? Config['queues'] : {}) & Q });
	};

	/**
	 * Add before middleware
	 */
	before = <F extends BeforeFunction>(fn: F) => {
		return new Worker({
			...this.config,
			before: [...(this.config.before || []), fn],
		} as Config & { before: [...(Config['before'] extends BeforeFunction[] ? Config['before'] : []), F] });
	};

	/**
	 * Add after middleware
	 */
	after = <F extends AfterFunction>(fn: F) => {
		return new Worker({
			...this.config,
			after: [...(this.config.after || []), fn],
		} as Config & { after: [...(Config['after'] extends AfterFunction[] ? Config['after'] : []), F] });
	};

	/**
	 * Add error handler
	 */
	onError = <F extends ErrorFunction>(fn: F) => {
		return new Worker({
			...this.config,
			onError: [...(this.config.onError || []), fn],
		} as Config & { onError: [...(Config['onError'] extends ErrorFunction[] ? Config['onError'] : []), F] });
	};

	/**
	 * Add cron job
	 */
	cron = <Schedule extends string>(schedule: Schedule, fn: CronFunction) => {
		return new Worker({
			...this.config,
			crons: {
				...(this.config.crons || {}),
				[schedule]: fn,
			},
		} as Config & { crons: (Config['crons'] extends Record<string, CronFunction> ? Config['crons'] : {}) & Record<Schedule, CronFunction> });
	};

	/**
	 * Bind a Durable Object to the worker
	 */
	object = <K extends string, DO extends DurableObjectConstructor>(key: K, durableObject: DO) => {
		return new Worker({
			...this.config,
			objects: {
				...(this.config.objects || {}),
				[key]: durableObject,
			},
		} as Config & {
			objects: (Config['objects'] extends Record<string, DurableObjectConstructor> ? Config['objects'] : {}) & Record<K, DO>;
		});
	};

	fetch = (request: Request) => {
		return new Response('hello');
	};

	declare '~infer': {
		router: Config['queues'] & (Config['plugins'] extends WorkerPlugin[] ? MergeIntoObject<Config['plugins'], 'router'> : {});
		queues: Config['queues'] & (Config['plugins'] extends WorkerPlugin[] ? MergeIntoObject<Config['plugins'], 'queues'> : {});
		exposed: Config['plugins'] extends WorkerPlugin[] ? MergeIntoObject<Config['plugins'], 'expose'> : {};
		objects: Config['objects'] extends Record<string, DurableObjectConstructor> ? Config['objects'] : {};
		middleware: Config['plugins'] extends WorkerPlugin[] ? MergeMiddlewares<Config['plugins']> : never;
		plugins: Config['plugins'];
	};
}

type T = (typeof worker)['~infer']['exposed'];
type O = (typeof worker)['~infer']['middleware'];
type P = (typeof worker)['~infer']['plugins'];

const p1 = {
	expose: {
		banana: true,
	},
};

const router2 = {
	test2: worker.route
		.input(
			object({
				streing: string(),
			})
		)
		.handle(({ input, event, ctx }) => {
			const t = ctx.test();
			return 'hello';
		}),
};
