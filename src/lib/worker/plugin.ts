import { AnyDurableServer } from '../durable/object';
import { Middleware } from '../rpc';
import { WorkerRequestEvent } from '../rpc/requestEvent';
import { AnyRouter } from '../rpc/router';
import { MaybePromise } from '../utils/types';
import { CorsOptions } from './cors';
import { Worker } from './worker';

export interface WorkerPlugin {
	init?: (initOpts: { env: Env; ctx: ExecutionContext; worker: Worker }) => MaybePromise<void>;
	router?: AnyRouter;
	queues?: AnyRouter;
	middleware?: Middleware<'worker' | 'queue'>;
	before?: ((opts: { event: WorkerRequestEvent }) => MaybePromise<Response | void>)[];
	after?: ((response: Response, opts: { event: WorkerRequestEvent }) => MaybePromise<Response | void>)[];
	onError?: (errorPayload: { error: unknown; event: WorkerRequestEvent }) => Response | void;
	cors?: false | CorsOptions | ((opts: { event: WorkerRequestEvent }) => MaybePromise<CorsOptions | false | undefined>);
	objects?: Record<string, new (ctx: DurableObjectState, env: Env) => AnyDurableServer>;
	expose?: Record<string, any>;
}

export type NonOptionalWorkerPlugin = {
	[K in keyof WorkerPlugin]-?: WorkerPlugin[K];
};
