import { DurableRequestEvent, Session, WebsocketInputRequestEvent } from '../rpc/requestEvent';
import { AnyRouter, mergeRouters, MergeRouters } from '../rpc/router';
import { AnyDurableServer, DurableServer } from './object';
import { WS_API } from './websocket';
import { TASK_API } from './scheduler';
import { MaybePromise } from '../utils/types';
export class DurablePlugin {
	declare router?: AnyRouter;
	declare ws_in?: AnyRouter;
	declare ws_out?: AnyRouter;
	declare tasks?: AnyRouter;
	declare onFetch?: (opts: { event: DurableRequestEvent }) => MaybePromise<void>;
	declare onAlarm?: (otps: { server: AnyDurableServer }) => MaybePromise<void>;
	declare onWebSocketClose?: (opts: {
		ws: WebSocket;
		code: number;
		reason: string;
		session: Session;
		server: AnyDurableServer;
	}) => MaybePromise<void>;
	declare blockConcurrencyWhile?: (opts: { server: AnyDurableServer }) => MaybePromise<void>;
	declare onWebSocketError?: (opts: { ws: WebSocket; error: unknown; session: Session; server: AnyDurableServer }) => MaybePromise<void>;
	declare onWebSocketMessage?: (opts: { event: WebsocketInputRequestEvent; input: any; isHandled: boolean }) => MaybePromise<void>;
	declare onArrayBufferMessage?: (opts: {
		event: WebsocketInputRequestEvent;
		input: ArrayBuffer;
		isHandled: boolean;
	}) => MaybePromise<void>;
	declare onWebSocketOpen?: (opts: { event: DurableRequestEvent; session: Session }) => MaybePromise<void>;
	expose?: Record<string, any> = undefined;
}
export type NonOptionalDurablePlugin = {
	[K in keyof DurablePlugin]-?: DurablePlugin[K];
};
export type PluginFunctions = {
	[K in keyof NonOptionalDurablePlugin]: NonOptionalDurablePlugin[K] extends (...args: any[]) => any ? K : never;
}[keyof NonOptionalDurablePlugin];

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

export type ExtractPluggedRouters<K extends 'router' | 'ws_in' | 'ws_out' | 'tasks', P extends DurablePlugin[]> = UnionToIntersection<
	Exclude<P[number][K], undefined>
>;

type InferAllRouters<
	D extends RestrictedDurableObject<AnyDurableServer>,
	PLUGINS extends DurablePlugin[],
	key extends 'router' | 'ws_in' | 'ws_out' | 'tasks'
> = D[key] extends AnyRouter
	? ExtractPluggedRouters<key, PLUGINS> extends AnyRouter
		? D[key] & ExtractPluggedRouters<key, PLUGINS>
		: D[key]
	: ExtractPluggedRouters<key, PLUGINS> extends AnyRouter
	? ExtractPluggedRouters<key, PLUGINS>
	: never;

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
		router: mergeRouters.apply(null, router) || {},
		ws_in: mergeRouters.apply(null, ws_in) || {},
		ws_out: mergeRouters.apply(null, ws_out) || {},
		tasks: mergeRouters.apply(null, tasks) || {},
	} as {
		router: ExtractPluggedRouters<'router', Plugins>;
		ws_in: ExtractPluggedRouters<'ws_in', Plugins>;
		ws_out: ExtractPluggedRouters<'ws_out', Plugins>;
		tasks: ExtractPluggedRouters<'tasks', Plugins>;
	};
};

type RestrictedDurableObject<T> = Omit<T, 'invokePlugins' | 'fetch' | 'webSocketError' | 'webSocketClose' | 'webSocketMessage'>;

export const createDurableObject = <PLUGINS extends DurablePlugin[]>(...plugins: PLUGINS) => {
	const merged = mergePlugins(...plugins);
	type EXPOSITION = UnionToIntersection<Exclude<PLUGINS[number]['expose'], undefined>>;

	class DurableObjectWithPlugins<
		Self extends RestrictedDurableObject<DurableServer<AnyRouter, AnyRouter, AnyRouter, AnyRouter, PLUGINS>>
	> extends DurableServer<AnyRouter, AnyRouter, AnyRouter, AnyRouter, PLUGINS> {
		plugins: PLUGINS = plugins;

		// declare exposed: EXPOSITION;
		declare send: WS_API<InferAllRouters<Self, PLUGINS, 'ws_out'>>;
		declare schedule: TASK_API<InferAllRouters<Self, PLUGINS, 'tasks'>>;
		declare onFetch?: (opts: { event: DurableRequestEvent }) => MaybePromise<void>;
		declare onAlarm?: (otps: { server: AnyDurableServer }) => MaybePromise<void>;
		declare onWebSocketClose?: (opts: {
			ws: WebSocket;
			code: number;
			reason: string;
			session: Session;
			server: AnyDurableServer;
		}) => MaybePromise<void>;
		declare blockConcurrencyWhile?: (opts: { server: AnyDurableServer }) => MaybePromise<void>;
		declare onWebSocketError?: (opts: { ws: WebSocket; error: unknown; session: Session; server: AnyDurableServer }) => MaybePromise<void>;
		declare onWebSocketMessage?: (opts: { event: WebsocketInputRequestEvent; input: any; isHandled: boolean }) => MaybePromise<void>;
		declare onArrayBufferMessage?: (opts: {
			event: WebsocketInputRequestEvent;
			input: ArrayBuffer;
			isHandled: boolean;
		}) => MaybePromise<void>;
		declare onWebSocketOpen?: (opts: { event: DurableRequestEvent; session: Session }) => MaybePromise<void>;
		declare infer: {
			router: InferAllRouters<Self, PLUGINS, 'router'>;
			ws_out: InferAllRouters<Self, PLUGINS, 'ws_out'>;
			ws_in: InferAllRouters<Self, PLUGINS, 'ws_in'>;
			tasks: InferAllRouters<Self, PLUGINS, 'tasks'>;
		};
		private exposition: EXPOSITION = {} as EXPOSITION;
		get = <K extends keyof EXPOSITION>(key: K): EXPOSITION[K] => {
			return this.exposition[key];
		};
		constructor(ctx: DurableObjectState, env: Env) {
			super(ctx, env);
			const selfPlugin = {
				onFetch: this.onFetch,
				onAlarm: this.onAlarm,
				onWebSocketClose: this.onWebSocketClose,
				blockConcurrencyWhile: this.blockConcurrencyWhile,
				onWebSocketError: this.onWebSocketError,
				onWebSocketMessage: this.onWebSocketMessage,
				onArrayBufferMessage: this.onArrayBufferMessage,
				onWebSocketOpen: this.onWebSocketOpen,
			} satisfies DurablePlugin;
			this.plugins.push(selfPlugin);
			this.router = Object.assign({}, this.router || {}, merged.router);
			this.ws_in = Object.assign({}, this.ws_in || {}, merged.ws_in);
			this.ws_out = Object.assign({}, this.ws_out || {}, merged.ws_out);
			this.tasks = Object.assign({}, this.tasks || {}, merged.tasks);
			plugins.forEach((plugin) => {
				if (plugin.expose) {
					const keys = Object.keys(plugin.expose || {}) as (keyof typeof plugin.expose)[];
					keys.forEach((key) => {
						Object.defineProperty(this.exposition, key, {
							get() {
								return plugin.expose?.[key];
							},
						});
					});
				}
			});
		}
	}

	return DurableObjectWithPlugins as new <
		Self extends RestrictedDurableObject<DurableServer<AnyRouter, AnyRouter, AnyRouter, AnyRouter, PLUGINS>>
	>(
		ctx: DurableObjectState,
		env: Env
	) => RestrictedDurableObject<DurableObjectWithPlugins<Self>>;
};
