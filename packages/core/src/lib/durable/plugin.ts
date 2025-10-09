import { DurableRequestEvent, Session, WebsocketInputRequestEvent } from '../rpc/requestEvent';
import { AnyRouter, mergeRouters } from '../rpc/router';
import { MergeExpose, type MergeRouters } from '../utils/types';
import { AnyDurableServer, DurableServer } from './object';
import { WS_API } from './websocket';
import { TASK_API } from './scheduler';
import { MaybePromise, UnionToIntersection } from '../utils/types';

export interface DurablePlugin {
	router?: AnyRouter;
	ws_in?: AnyRouter;
	ws_out?: AnyRouter;
	tasks?: AnyRouter;
	onFetch?: (opts: { event: DurableRequestEvent }) => MaybePromise<void>;
	onAlarm?: (otps: { object: AnyDurableServer }) => MaybePromise<void>;
	onWebSocketClose?: (opts: {
		ws: WebSocket;
		code: number;
		reason: string;
		session: Session;
		object: AnyDurableServer;
	}) => MaybePromise<void>;
	blockConcurrencyWhile?: (opts: { object: AnyDurableServer }) => MaybePromise<void>;
	onWebSocketError?: (opts: { ws: WebSocket; error: unknown; session: Session; object: AnyDurableServer }) => MaybePromise<void>;
	onWebSocketMessage?: (opts: { event: WebsocketInputRequestEvent; input: any; isHandled: boolean }) => MaybePromise<void>;
	onArrayBufferMessage?: (opts: { event: WebsocketInputRequestEvent; input: ArrayBuffer; isHandled: boolean }) => MaybePromise<void>;
	onWebSocketOpen?: (opts: { event: DurableRequestEvent; session: Session }) => MaybePromise<void>;
	expose?: Record<string, any>;
}
export type NonOptionalDurablePlugin = {
	[K in keyof DurablePlugin]-?: DurablePlugin[K];
};
export type PluginFunctions = {
	[K in keyof NonOptionalDurablePlugin]: NonOptionalDurablePlugin[K] extends (...args: any[]) => any ? K : never;
}[keyof NonOptionalDurablePlugin];

export type ExtractPluggedRouters<K extends 'router' | 'ws_in' | 'ws_out' | 'tasks', P extends DurablePlugin[]> = UnionToIntersection<
	Exclude<P[number][K], undefined>
>;

export type InferAllRouters<
	D extends { router?: AnyRouter; ws_in?: AnyRouter; ws_out?: AnyRouter; tasks?: AnyRouter; queues?: AnyRouter },
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

export type RestrictedDurableObject<T> = Omit<T, 'invokePlugins' | 'fetch' | 'webSocketError' | 'webSocketClose' | 'webSocketMessage'>;

export const createDurableObject = <PLUGINS extends DurablePlugin[]>(...plugins: PLUGINS) => {
	const merged = mergePlugins(...plugins);

	let EXPOSITION = {} as MergeExpose<PLUGINS>;

	class DurableObjectWithPlugins<
		Self extends RestrictedDurableObject<DurableServer<AnyRouter, AnyRouter, AnyRouter, AnyRouter, PLUGINS>>
	> extends DurableServer<AnyRouter, AnyRouter, AnyRouter, AnyRouter, PLUGINS> {
		plugins: PLUGINS = plugins;

		// declare exposed: EXPOSITION;
		declare send: WS_API<InferAllRouters<Self, PLUGINS, 'ws_out'>>;
		declare schedule: TASK_API<InferAllRouters<Self, PLUGINS, 'tasks'>>;
		declare onFetch?: (opts: { event: DurableRequestEvent }) => MaybePromise<void>;
		declare onAlarm?: (otps: { object: AnyDurableServer }) => MaybePromise<void>;
		declare onWebSocketClose?: (opts: {
			ws: WebSocket;
			code: number;
			reason: string;
			session: Session;
			object: AnyDurableServer;
		}) => MaybePromise<void>;
		declare blockConcurrencyWhile?: (opts: { object: AnyDurableServer }) => MaybePromise<void>;
		declare onWebSocketError?: (opts: { ws: WebSocket; error: unknown; session: Session; object: AnyDurableServer }) => MaybePromise<void>;
		declare onWebSocketMessage?: (opts: { event: WebsocketInputRequestEvent; input: any; isHandled: boolean }) => MaybePromise<void>;
		declare onArrayBufferMessage?: (opts: {
			event: WebsocketInputRequestEvent;
			input: ArrayBuffer;
			isHandled: boolean;
		}) => MaybePromise<void>;
		declare onWebSocketOpen?: (opts: { event: DurableRequestEvent; session: Session }) => MaybePromise<void>;
		// @ts-ignore TS4094

		get = <K extends keyof typeof EXPOSITION>(key: K): (typeof EXPOSITION)[K] => {
			return EXPOSITION[key];
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
						Object.defineProperty(EXPOSITION, key, {
							get() {
								return plugin.expose?.[key];
							},
						});
					});
				}
			});
		}

		declare ['~infer']: {
			router: MergeRouters<Self, PLUGINS, 'router'>;
			ws_out: MergeRouters<Self, PLUGINS, 'ws_out'>;
			ws_in: MergeRouters<Self, PLUGINS, 'ws_in'>;
			tasks: MergeRouters<Self, PLUGINS, 'tasks'>;
			exposed: MergeExpose<PLUGINS>;
			plugins: PLUGINS;
		};
	}

	return DurableObjectWithPlugins as new <
		Self extends RestrictedDurableObject<DurableServer<AnyRouter, AnyRouter, AnyRouter, AnyRouter, PLUGINS>>
	>(
		ctx: DurableObjectState,
		env: Env
	) => RestrictedDurableObject<DurableObjectWithPlugins<Self>>;
};

export type AnyRestrictedDurableObject = RestrictedDurableObject<AnyDurableServer>;

export type AnyDurableInfer = {
	router: AnyRouter;
	ws_out: AnyRouter;
	ws_in: AnyRouter;
	tasks: AnyRouter;
	exposed: Record<string, any>;
};
