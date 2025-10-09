import { optional, array, object, string } from 'zod/mini';
import { AnyRouter } from '../rpc/router';
import { DurableServer } from './object';

import { API, createApi } from '../rpc/api';
import { DurableRequestEvent, Session, WebsocketInputRequestEvent, WebsocketOutputRequestEvent } from '../rpc/requestEvent';
import { error, handleError, websocketError } from '../error';
import { stringify, parse } from 'devalue';
import { withCookies } from '../cookies';
import { Register } from '..';
import { getHandler } from '../rpc/handler';
import { validate } from '../utils/validate';
import { WS_PRESENCE_TYPE, WS_RESPONSE_TYPE } from '../constants';
import { DurablePlugin } from './plugin';

export type Tags = Register extends {
	Tags: infer _Tags;
}
	? _Tags
	: string;

const sendOptions = optional(
	object({
		to: optional(array(string())),
		omit: optional(array(string())),
	})
);

export const serializeSession = (ws: WebSocket, value: Session) => {
	ws.serializeAttachment(stringify(value));
};

export const deserializeSession = (ws: WebSocket): Session => {
	return parse(ws.deserializeAttachment()) as Session;
};

export type WS_API<Out extends AnyRouter | undefined = undefined> = Out extends AnyRouter ? API<Out, typeof sendOptions> : undefined;

export class WebsocketManager<In extends AnyRouter | undefined = undefined, Out extends AnyRouter | undefined = undefined> {
	private server: DurableServer<any, any, In, Out, DurablePlugin[]>;

	constructor(server: DurableServer<any, any, In, Out, DurablePlugin[]>) {
		this.server = server;
		this.server.send = createApi({
			router: server.ws_out,
			callback: async ({ data, opts = { to: 'ALL' }, handler, path }) => {
				const { to, omit } = opts;
				const sessions = this.getSessions().filter(({ session }) => {
					if (to === 'ALL') return true;
					if (omit && omit.length > 0) {
						return !omit.includes(session.participant.id);
					} else if (Array.isArray(to)) {
						return to.includes(session.participant.id);
					}
					return true;
				});

				if (sessions.length) {
					const event: WebsocketOutputRequestEvent = {
						to: sessions,
						object: this.server,
					};
					const ctx = await handler?.call(event, data);
					sessions.forEach(({ ws }) => {
						ws.send(stringify({ type: path.join('.'), data, ctx }));
					});
				}
			},
			options: sendOptions,
		});

		// const x = {
		// 	broadcast: createApi({
		// 		router: server.ws_out,
		// 		callback: async ({ data, handler, path }) => {
		// 			const event: WebsocketOutputRequestEvent = {
		// 				to: this.getSessions(),
		// 				env: this.server.env,
		// 				ctx: this.server.ctx,
		// 			};
		// 			const ctx = await handler?.call(event, data);
		// 			event.to.forEach(({ ws }) => {
		// 				ws.send(stringify({ type: path.join('.'), data, ctx }));
		// 			});
		// 		},
		// 	}),
		// };
	}

	init = async () => {
		this.server.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
	};

	getSessions = (tag?: Tags) => {
		return this.server.ctx
			.getWebSockets(tag)
			.map((ws) => ({
				session: deserializeSession(ws),
				ws,
			}))
			.filter((s) => s.session.connected);
	};

	private sendPresence = (tag?: Tags) => {
		const webSockets: WebSocket[] = [];

		const participants = this.getSessions(tag === 'ALL' ? undefined : tag)
			.filter(({ ws, session }) => {
				if (session.connected !== true) {
					return false;
				}
				webSockets.push(ws);
				return true;
			})
			.map(({ session: { participant } }) => participant);

		webSockets.forEach((value) => {
			value.send(stringify({ type: WS_PRESENCE_TYPE, data: participants }));
		});
	};

	async onWebSocketError(ws: WebSocket, error: unknown) {
		const session = deserializeSession(ws);
		await this.server.invokePlugins('onWebSocketError', { ws, error, session, object: this.server });
		setTimeout(() => {
			this.sendPresence();
		});
	}
	async onWebSocketClose(ws: WebSocket, code: number, reason: string) {
		const session = deserializeSession(ws);
		await this.server.invokePlugins('onWebSocketClose', { ws, code, reason, session, object: this.server });
		setTimeout(() => {
			this.sendPresence();
		});
	}

	async handleWebSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		try {
			const session = deserializeSession(ws);
			const event: WebsocketInputRequestEvent = {
				ws,
				session,
				object: this.server,
			};
			if (typeof message !== 'string') {
				await this.server.invokePlugins('onArrayBufferMessage', {
					event,
					isHandled: false,
					input: message as ArrayBuffer,
				});
			}
			const { type: messageType, data: messageData, id: messageId } = parse(message as string);
			const handler = getHandler(this.server.ws_in, messageType.split('.'), false);
			const parsedData = await validate(handler?.schema, messageData);

			await this.server.invokePlugins('onWebSocketMessage', {
				event,
				input: parsedData,
				isHandled: !!handler,
			});

			if (handler) {
				const response = await handler?.call(event, parsedData);
				ws.send(stringify({ type: WS_RESPONSE_TYPE, data: response, id: messageId }));
			} else {
				ws.send(websocketError('NOT_FOUND', 'Handler not found'));
			}
		} catch (error) {
			ws.send(websocketError('INTERNAL_SERVER_ERROR', 'Internal server error'));
		}
	}

	handleWebsocketConnection = async (event: DurableRequestEvent) => {
		if (!this.server.ws_out && !this.server.ws_in) {
			return error('SERVICE_UNAVAILABLE');
		}
		let session: Session | undefined = undefined;
		let ws: WebSocket | undefined = undefined;
		try {
			const [client, server] = Object.values(new WebSocketPair());
			ws = server;
			let {
				session: sessionData = {},
				participant = { id: crypto.randomUUID() },
				tags = [],
			} = (await this.server?.getSessionDataAndParticipant?.(event)) || {};

			if (!participant.id) {
				participant.id = crypto.randomUUID();
			}

			session = {
				id: crypto.randomUUID(),
				participant,
				connected: true,
				createdAt: Date.now(),
				data: sessionData,
			};

			serializeSession(server, session);

			this.server.ctx.acceptWebSocket(server, tags);

			this.sendPresence();

			await this.server.invokePlugins('onWebSocketOpen', {
				event,
				session,
			});

			return withCookies(
				new Response(null, {
					status: 101,
					webSocket: client,
				}),
				event
			);
		} catch (error) {
			// this.server?.onError?.({ error, ws, session, object: this });
			return handleError(error);
		}
	};
}
