import { any, string } from 'zod';
import { DurableRequestEvent, Session, WebsocketInputRequestEvent } from '../rpc/requestEvent';
import { AnyRouter, createRouter, mergeRouters, MergeRouters } from '../rpc/router';
import { AnyDurableServer, DurableServer } from './object';
import { WS_API } from './websocket';

export class DurablePlugin {
	declare router?: AnyRouter;
	declare ws_in?: AnyRouter;
	declare ws_out?: AnyRouter;
	declare tasks?: AnyRouter;
	declare onFetch?: (event: DurableRequestEvent) => Promise<void>;
	declare onAlarm?: ({ ctx, env }: { ctx: DurableObjectState; env: Env }) => Promise<void>;
	declare onWebSocketClose?: ({
		ws,
		code,
		reason,
		session,
	}: {
		ws: WebSocket;
		code: number;
		reason: string;
		session: Session;
	}) => Promise<void>;
	declare init?: ({ ctx, env }: { ctx: DurableObjectState; env: Env }) => Promise<void>;
	declare onWebSocketError?: ({ ws, error, session }: { ws: WebSocket; error: unknown; session: Session }) => Promise<void>;
	declare onWebSocketMessage?: (event: WebsocketInputRequestEvent & { input: any; ws: WebSocket; isHandled: boolean }) => Promise<void>;
	declare onArrayBufferMessage?: (
		event: WebsocketInputRequestEvent & { input: ArrayBuffer; ws: WebSocket; isHandled: boolean }
	) => Promise<void>;
	declare onWebSocketOpen?: (event: DurableRequestEvent & { ws: WebSocket; session: Session }) => Promise<void>;
	declare expose?: Record<string, any>;
}

const t = createRouter('worker');
const w = createRouter('out');

class Plugin1 extends DurablePlugin {
	router = {
		test1: t
			.procedure()
			.input(any())
			.handle(async () => {
				return 'coucou';
			}),
	};
	ws_out = {
		test1: t
			.procedure()
			.input(any())
			.handle(async () => {
				return 'coucou';
			}),
	};
}

class Plugin2 extends DurablePlugin {
	router = {
		test2: t
			.procedure()
			.input(string())
			.handle(async () => {
				return 'coucou';
			}),
	};
	ws_out = {
		test: w
			.procedure()
			.input(string())
			.handle(async () => {
				return {
					data: 'coucou',
				};
			}),
	};
}

const plugins = [new Plugin1(), new Plugin2()];

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

export type ExtractPluggedRouters<K extends 'router' | 'ws_in' | 'ws_out' | 'tasks', P extends DurablePlugin[]> = AsAnyRouter<
	UnionToIntersection<Exclude<P[number][K], undefined>>
>;

const mergePlugins = <Plugins extends DurablePlugin[]>(...plugins: Plugins) => {
	const { router, ws_in, ws_out, tasks } = plugins.reduce(
		(acc, plugin) => {
			if (plugin.ws_in) {
				acc.ws_in.push(plugin.ws_in);
			}
			if (plugin.ws_out) {
				acc.ws_out.push(plugin.ws_out);
			}
			if (plugin.tasks) {
				acc.tasks.push(plugin.tasks);
			}
			if (plugin.router) {
				acc.router.push(plugin.router);
			}
			return acc;
		},
		{
			ws_in: [],
			ws_out: [],
			tasks: [],
			router: [],
		} as { router: AnyRouter[]; ws_in: AnyRouter[]; ws_out: AnyRouter[]; tasks: AnyRouter[] }
	);
	return {
		router: mergeRouters(...router) || {},
		ws_in: mergeRouters(...ws_in) || {},
		ws_out: mergeRouters(...ws_out) || {},
		tasks: mergeRouters(...tasks) || {},
	} as {
		router: ExtractPluggedRouters<'router', Plugins>;
		ws_in: ExtractPluggedRouters<'ws_in', Plugins>;
		ws_out: ExtractPluggedRouters<'ws_out', Plugins>;
		tasks: ExtractPluggedRouters<'tasks', Plugins>;
	};
};

export const createDurableObject = <PLUGINS extends DurablePlugin[]>(...plugins: PLUGINS) => {
	const merged = mergePlugins(...plugins);
	class DurableObjectWithPlugins<Self extends DurableServer<any, any, any, AnyRouter, PLUGINS>> extends DurableServer<
		any,
		any,
		any,
		AnyRouter,
		PLUGINS
	> {
		plugins: PLUGINS = plugins;
		declare ws: WS_API<InferAllRouters<Self, 'ws_out'>>;
		plugged_router = merged.router;
		plugged_ws_in = merged.ws_in;
		plugged_ws_out = merged.ws_out;
		plugged_tasks = merged.tasks;
		constructor(ctx: DurableObjectState, env: Env) {
			super(ctx, env);
		}
	}

	return DurableObjectWithPlugins;
};

export class MyDurableObject extends createDurableObject(...plugins)<MyDurableObject> {
	// ws_out = {
	// 	test4: w
	// 		.procedure()
	// 		.input(string())
	// 		.handle(async (input) => {
	// 			return `coucou ${input}`;
	// 		}),
	// };

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		// const t = this.ws.send.test('coucou', { to: ['elzk'] });
	}

	router = {
		test: createRouter('worker')
			.procedure()
			.input(any())
			.handle(async () => {
				return 'coucou';
			}),
	};
}

type AsAnyRouter<T> = T extends AnyRouter ? T : never;

type InferAllRouters<D extends AnyDurableServer, key extends 'router' | 'ws_in' | 'ws_out' | 'tasks'> = D[key] extends AnyRouter
	? D[`plugged_${key}`] extends AnyRouter
		? D[key] & D[`plugged_${key}`]
		: D[key]
	: D[`plugged_${key}`] extends AnyRouter
	? D[`plugged_${key}`]
	: never;

type ExtractDurableObjectMergedRouter<T, key extends 'router' | 'ws_in' | 'ws_out' | 'tasks'> = T extends new (
	ctx: DurableObjectState,
	env: Env
) => infer D
	? D extends AnyDurableServer
		? InferAllRouters<D, key>
		: never
	: never;

const worker = {
	DURABLE_OBJECT: MyDurableObject,
};

type Worker = typeof worker;
type T = Worker['DURABLE_OBJECT'];

type TT = ExtractDurableObjectMergedRouter<T, 'ws_out'>;

type Test<T, key extends 'router' | 'ws_in' | 'ws_out' | 'tasks'> = T extends new (ctx: DurableObjectState, env: Env) => infer D
	? D extends AnyDurableServer
		? D[key] extends undefined
			? true
			: never
		: never
	: never;

type TTT = Test<T, 'ws_out'>;
