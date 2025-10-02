import { array, object } from 'zod';
import { AnyRouter } from '../rpc/router';
import { DurableServer } from './object';
import { string } from 'zod/mini';
import { API, createApi } from '../rpc/api';
import { DurableRequestEvent, Session } from '../rpc/requestEvent';
import { error, handleError } from '../error';
import { stringify, parse } from 'devalue';
import { withCookies } from '../cookies';
import { Register } from '..';

export type Tags = Register extends {
	Tags: infer _Tags;
}
	? _Tags
	: string;

const sendOptions = object({
	to: array(string()).optional(),
	omit: array(string()).optional(),
});

export const serializeSession = (ws: WebSocket, value: Session) => {
	ws.serializeAttachment(stringify(value));
};

export const deserializeSession = (ws: WebSocket): Session => {
	return parse(ws.deserializeAttachment()) as Session;
};

export class WebsocketManager<In extends AnyRouter | undefined = undefined, Out extends AnyRouter | undefined = undefined> {
	private server: DurableServer<any, any, In, Out>;

	ws: {
		send: Out extends AnyRouter ? API<Out, typeof sendOptions> : undefined;
		broadcast: Out extends AnyRouter ? API<Out> : undefined;
	};

	constructor(server: DurableServer<any, any, In, Out>) {
		this.server = server;
		this.ws = {
			send: createApi({
				router: server.ws_out,
				callback: ({ data, opts, handler, path }) => {},
				options: sendOptions,
			}),
			broadcast: createApi({
				router: server.ws_out,
				callback: ({ data, opts, handler, path }) => {},
			}),
		};
	}

	init = async () => {
		this.server.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
	};

	getSessions = (tag?: Tags) => {
		return this.server.ctx.getWebSockets(tag).map((ws) => ({
			session: deserializeSession(ws),
			ws,
		}));
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
			value.send(stringify({ type: 'presence', data: participants }));
		});
	};

	async onWebSocketError(ws: WebSocket, error: unknown) {
		setTimeout(() => {
			this.sendPresence();
		});
	}
	async onWebSocketClose(ws: WebSocket, code: number, reason: string) {
		setTimeout(() => {
			this.sendPresence();
		});
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

			// this.onConnectionOpen?.(server, session);

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
