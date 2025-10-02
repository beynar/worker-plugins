import { DurableObject } from 'cloudflare:workers';
import { WebsocketManager, WS_API } from './websocket';
import { DurableKV } from './kv';
import { Scheduler } from './scheduler';
import { AnyRouter, createRouter } from '../rpc/router';
import { createDurableRequestEvent, DurableMeta, DurableRequest, DurableRequestEvent } from '../rpc/requestEvent';
import { object, string } from 'zod';

export class DurableServer<
	Router extends AnyRouter | undefined = undefined,
	Tasks extends AnyRouter | undefined = undefined,
	WS_IN extends AnyRouter | undefined = undefined,
	WS_OUT extends AnyRouter | undefined = undefined
> extends DurableObject<any, any> {
	schedule: Scheduler<Tasks>['schedule'];
	kv: DurableKV;
	private websocketManager: WebsocketManager<WS_IN, WS_OUT>;
	private scheduler: Scheduler<Tasks>;

	declare plugins?: any[];
	declare tasks: Tasks;
	declare router: Router;
	declare ws_in: WS_IN;
	declare ws_out: WS_OUT;
	declare ws: WS_API<WS_OUT>;

	declare getSessionDataAndParticipant?: (event: DurableRequestEvent) => Promise<{ session: any; participant: any; tags: string[] }>;

	constructor(public ctx: DurableObjectState, public env: Env) {
		super(ctx, env);
		this.websocketManager = new WebsocketManager(this);
		this.kv = new DurableKV(ctx);
		this.scheduler = new Scheduler(this);
		this.schedule = this.scheduler.schedule;
		this.ctx.blockConcurrencyWhile(async () => {
			await this.websocketManager.init();
			await this.kv.init();
			await this.scheduler.init();
		});
	}

	// @ts-ignore
	async fetch(request: DurableRequest): Promise<Response> {
		const event = createDurableRequestEvent(request, this.env, this.ctx);
		this.plugins?.forEach((plugin) => {
			plugin.onFetch?.(event);
		});

		if (request.cf.isWebSocketConnect) {
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

export type AnyDurableServer = DurableServer<any, any, any, any>;
