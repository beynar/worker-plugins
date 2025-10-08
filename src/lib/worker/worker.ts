import { Request } from '@cloudflare/workers-types';
import { WorkerPlugin } from './plugin';
import {
	WorkerRequestEvent,
	AnyRouter,
	createRouter,
	QueueRequestEvent,
	GetObjectJurisdictionOrLocationHint,
	createWorkerEvent,
} from '../rpc';
import { IntersectArrayProp, MaybePromise, SafeReturnType } from '../utils/types';
import { FLARERROR } from '../error';
import { Middleware } from '../rpc';
import { DurableServerConstructor } from '../durable/object';
import { fetch as workerFetch } from './fetch';
type BeforeFunction = (opts: { event: WorkerRequestEvent }) => MaybePromise<Response | void>;
type AfterFunction = (opts: {
	response?: Response;
	event: WorkerRequestEvent;
	error?: FLARERROR | unknown;
}) => MaybePromise<Response | void>;
type CronFunction = () => MaybePromise<void>;
type ErrorFunction = (errorPayload: { error: FLARERROR | unknown; event: WorkerRequestEvent }) => MaybePromise<Response | void>;

export interface WorkerConfig {
	name?: string;
	router?: AnyRouter;
	queues?: AnyRouter;
	before?: BeforeFunction[];
	after?: AfterFunction[];
	onError?: ErrorFunction[];
	crons?: Record<string, CronFunction>;
	plugins?: WorkerPlugin[];
	objects?: Record<string, [DurableServerConstructor, GetObjectJurisdictionOrLocationHint]>;
}

type MergeMiddlewares<T extends WorkerPlugin[], Acc extends Record<string, any> = {}> = T extends [
	infer Head extends WorkerPlugin,
	...infer Tail extends WorkerPlugin[]
]
	? Head['middleware'] extends Middleware<'worker' | 'queue'>
		? MergeMiddlewares<Tail, Acc & SafeReturnType<Head['middleware']>>
		: MergeMiddlewares<Tail, Acc>
	: Acc;

export const createWorker = <N extends string>(name?: N) => {
	return new Worker({ name });
};
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

	private initPlugins = async (event: WorkerRequestEvent | QueueRequestEvent) => {
		return Promise.all(
			(this.config.plugins || []).reduce((acc, p) => {
				if (p.init) {
					const maybePromise = p.init({ event });
					if (maybePromise instanceof Promise) {
						acc.push(maybePromise);
					}
				}
				return acc;
			}, [] as Promise<any>[])
		);
	};
	private get exposed() {
		return (this.config.plugins || []).reduce((acc, plugin) => {
			return {
				...acc,
				...(plugin.expose || {}),
			};
		}, {} as this['~infer']['exposed']);
	}

	route = createRouter('worker')
		.use(this.pluginsMiddleware)
		.use(() => {
			return this.exposed;
		})
		.procedure();

	queue = createRouter('queue')
		.use(this.pluginsMiddleware)
		.use(() => {
			return this.exposed;
		})
		.procedure();

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
	queues = <const Q>(fn: (t: typeof this.queue) => Q) => {
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
	object = <K extends string, DO extends DurableServerConstructor>(
		key: K,
		durableObject: DO,
		getJurisdictionOrLocationHint?: GetObjectJurisdictionOrLocationHint
	) => {
		return new Worker({
			...this.config,
			objects: {
				...(this.config.objects || {}),
				[key]: [durableObject, getJurisdictionOrLocationHint],
			},
		} as Config & {
			objects: (Config['objects'] extends Record<string, [DurableServerConstructor, GetObjectJurisdictionOrLocationHint]>
				? Config['objects']
				: {}) &
				Record<K, [DO, GetObjectJurisdictionOrLocationHint]>;
		});
	};

	private fetch = async (request: Request, env: Env, ctx: ExecutionContext) => {
		const event = await createWorkerEvent(request, env, ctx, this.config);
		await this.initPlugins(event);
		return workerFetch(this.config, event);
	};

	entrypoint = {
		fetch: this.fetch,
	};

	declare '~infer': {
		router: Config['router'] & (Config['plugins'] extends WorkerPlugin[] ? IntersectArrayProp<Config['plugins'], 'router'> : {});
		queues: Config['queues'] & (Config['plugins'] extends WorkerPlugin[] ? IntersectArrayProp<Config['plugins'], 'queues'> : {});
		exposed: Config['plugins'] extends WorkerPlugin[] ? IntersectArrayProp<Config['plugins'], 'expose'> : {};
		objects: Config['objects'] extends Record<string, [DurableServerConstructor, GetObjectJurisdictionOrLocationHint]>
			? Config['objects']
			: {};
		middleware: Config['plugins'] extends WorkerPlugin[] ? MergeMiddlewares<Config['plugins']> : never;
		plugins: Config['plugins'];
	};
}

export type AnyWorkerInfer = {
	router: AnyRouter;
	queues: AnyRouter;
	exposed: Record<string, any>;
	objects: Record<string, [DurableServerConstructor, GetObjectJurisdictionOrLocationHint]>;
	middleware: Record<string, any>;
	plugins: WorkerPlugin[];
};
