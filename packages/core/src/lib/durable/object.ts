import { DurableObject } from 'cloudflare:workers';
import { WebsocketManager, WS_API } from './websocket';
import { DurableKV } from './kv';
import { Scheduler, TASK_API } from './scheduler';
import { AnyRouter } from '../rpc/router';
import { createDurableRequestEvent, DurableRequest, DurableRequestEvent } from '../rpc/requestEvent';
import { AnyRestrictedDurableObject, DurablePlugin, ExtractPluggedRouters, NonOptionalDurablePlugin } from './plugin';
import { ExtractFunctions } from '../utils/types';

export class DurableServer<
	ROUTER extends AnyRouter | undefined = undefined,
	TASKS extends AnyRouter | undefined = undefined,
	WS_IN extends AnyRouter | undefined = undefined,
	WS_OUT extends AnyRouter | undefined = undefined,
	PLUGINS extends DurablePlugin[] = DurablePlugin[]
> extends DurableObject<any, any> {
	declare plugins: PLUGINS;
	declare router: ROUTER;
	declare ws_in: WS_IN;
	declare ws_out: WS_OUT;
	declare send: WS_API<WS_OUT>;
	declare tasks: TASKS;
	declare schedule: TASK_API<TASKS>;
	scheduler: Scheduler<TASKS>;
	websocketManager: WebsocketManager<WS_IN, WS_OUT>;
	kv: DurableKV;

	declare infer: {
		router: AnyRouter;
		ws_in: AnyRouter;
		ws_out: AnyRouter;
		tasks: AnyRouter;
	};
	declare getSessionDataAndParticipant?: (event: DurableRequestEvent) => Promise<{ session: any; participant: any; tags: string[] }>;

	constructor(public ctx: DurableObjectState, public env: Env) {
		super(ctx, env);
		this.kv = new DurableKV(ctx);
		this.websocketManager = new WebsocketManager(this);
		this.scheduler = new Scheduler(this);
		this.ctx.blockConcurrencyWhile(async () => {
			await this.websocketManager.init();
			await this.kv.init();
			await this.scheduler.init();
			await this.invokePlugins('blockConcurrencyWhile', { object: this });
		});
	}

	invokePlugins = <T extends ExtractFunctions<NonOptionalDurablePlugin>>(type: T, payload: Parameters<NonOptionalDurablePlugin[T]>[0]) => {
		return Promise.all(
			this.plugins.reduce((acc, p) => {
				if (p[type]) {
					const maybePromise = p[type]?.(payload as any);
					if (maybePromise instanceof Promise) {
						acc.push(maybePromise);
					}
				}

				return acc;
			}, [] as Promise<void>[])
		);
	};

	// @ts-ignore
	async fetch(request: DurableRequest): Promise<Response> {
		const event = createDurableRequestEvent(request, this);
		await this.invokePlugins('onFetch', { event });
		if (request.cf.meta.isWebSocketConnect) {
			return this.websocketManager.handleWebsocketConnection(event);
		}
		return new Response(null);
	}

	async webSocketError(ws: WebSocket, error: unknown) {
		this.websocketManager.onWebSocketError(ws, error);
	}
	async webSocketClose(ws: WebSocket, code: number, reason: string) {
		this.websocketManager.onWebSocketClose(ws, code, reason);
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		this.websocketManager.handleWebSocketMessage(ws, message);
	}

	async alarm() {
		this.scheduler.alarm();
	}
}

export type AnyDurableServer = DurableServer<any, any, any, any, any>;
export type DurableServerConstructor = new (ctx: DurableObjectState, env: Env) => AnyRestrictedDurableObject;
