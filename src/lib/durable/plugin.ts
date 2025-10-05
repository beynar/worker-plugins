import { ZodMiniUnion, ZodMiniObject, ZodMiniDate, ZodMiniOptional, ZodMiniNumber, ZodMiniString } from 'zod/mini';
import { $strip } from 'zod/v4/core';
import { API } from '../rpc/api';
import { DurableRequestEvent, Session, WebsocketInputRequestEvent } from '../rpc/requestEvent';
import { AnyRouter, mergeRouters, MergeRouters } from '../rpc/router';
import { AnyDurableServer, DurableServer } from './object';
import { WS_API } from './websocket';
import { TASK_API } from './scheduler';

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

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

export type ExtractPluggedRouters<K extends 'router' | 'ws_in' | 'ws_out' | 'tasks', P extends DurablePlugin[]> = UnionToIntersection<
	Exclude<P[number][K], undefined>
>;

type InferAllRouters<
	D extends AnyDurableServer,
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
		declare send: WS_API<InferAllRouters<Self, PLUGINS, 'ws_out'>>;
		declare schedule: TASK_API<InferAllRouters<Self, PLUGINS, 'tasks'>>;
		constructor(ctx: DurableObjectState, env: Env) {
			super(ctx, env);
			this.router = Object.assign(this.router, merged.router);
			this.ws_in = Object.assign(this.ws_in, merged.ws_in);
			this.ws_out = Object.assign(this.ws_out, merged.ws_out);
			this.tasks = Object.assign(this.tasks, merged.tasks);
		}
	}

	return DurableObjectWithPlugins;
};
