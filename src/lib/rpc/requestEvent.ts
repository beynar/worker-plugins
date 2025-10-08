// import {  ServerOptions } from '.';
type ServerOptions = any;
import { Cookies } from '../cookies';
import type { Request as CfRequest } from '@cloudflare/workers-types';
import { ProcedureType } from './procedure';
import { Register } from '..';
import { MaybePromise } from '../utils/types';
import { AnyDurableServer } from '../durable/object';
import { WorkerConfig } from '../worker/worker';

export type DurableRequest = CfRequest & { cf: { meta: DurableMeta } };

export type GetObjectJurisdictionOrLocationHint =
	| ((opts: { event: WorkerRequestEvent }) => MaybePromise<JurisdictionOrLocationHint>)
	| JurisdictionOrLocationHint;

export type JurisdictionOrLocationHint = DurableObjectJurisdiction | DurableObjectLocationHint;

export type SessionData = Register extends {
	SessionData: infer _SessionData;
}
	? _SessionData
	: {};

export type Participant = Register extends {
	Participant: infer _Participant;
}
	? _Participant extends Record<string, any> & {
			id: string;
	  }
		? _Participant
		: {
				id: string;
		  }
	: {
			id: string;
	  };

export type Session = {
	id: string;
	participant: Participant;
	connected: boolean;
	createdAt: number;
	data: SessionData;
};

export type Meta = {
	name: keyof Env | null; // the durable object name
	id: string | null; // the durable object id
	location: JurisdictionOrLocationHint | null; // the durable object jurisdiction if specified
	isWebSocketConnect: boolean;
};
export type DurableMeta = Meta & Required<Pick<Meta, 'name' | 'id'>>;

export type WorkerRequestEvent = {
	request: CfRequest;
	env: Env;
	ctx: ExecutionContext;
	path: string[];
	meta: Meta;
	url: URL;
	cookies: Cookies;
};
export type CronRequestEvent = ScheduledController & {
	env: Env;
	ctx: ExecutionContext;
};

export type ScheduleRequestEvent = {
	server: AnyDurableServer;
};

export type DurableRequestEvent = {
	request: CfRequest;
	server: AnyDurableServer;
	path: string[];
	meta: Meta;
	url: URL;
	cookies: Cookies;
};

export type WebsocketOutputRequestEvent = {
	to: { session: Session; ws: WebSocket }[];
	server: AnyDurableServer;
};

export type WebsocketInputRequestEvent = {
	ws: WebSocket;
	session: Session;
	server: AnyDurableServer;
};

export type QueueRequestEvent = {
	batch: MessageBatch;
	path: string[];
	message: Message<unknown>;
	ctx: ExecutionContext;
	env: Env;
};

export type DynamicRequestEvent<P extends ProcedureType> = P extends 'queue'
	? QueueRequestEvent
	: P extends 'durable'
	? DurableRequestEvent
	: P extends 'in'
	? WebsocketInputRequestEvent
	: P extends 'out'
	? WebsocketOutputRequestEvent
	: P extends 'schedule'
	? ScheduleRequestEvent
	: WorkerRequestEvent;

const nullMeta: Meta = {
	name: null,
	id: null,
	location: null,
	isWebSocketConnect: false,
};

const getMeta = async (config: WorkerConfig, event: WorkerRequestEvent): Promise<Meta> => {
	const isObjectRequest = event.request.url.match(/\(([^:]+):([^)]+)\)/);
	if (!isObjectRequest || !config.objects) return nullMeta;
	const [name, id] = isObjectRequest.slice(1) as [keyof Env, string];
	if (!(name in config.objects)) return nullMeta;
	const [_, getJurisdictionOrLocationHint] = config.objects[name];

	const jurisdictionOrLocationHint =
		typeof getJurisdictionOrLocationHint === 'function'
			? await getJurisdictionOrLocationHint({ event })
			: getJurisdictionOrLocationHint || null;
	return {
		name,
		id,
		location: jurisdictionOrLocationHint,
		isWebSocketConnect: false,
	};
};

export const createWorkerEvent = async (
	request: CfRequest,
	env: Env,
	ctx: ExecutionContext,
	config: WorkerConfig
): Promise<WorkerRequestEvent> => {
	const url = new URL(decodeURI(request.url));
	const event: WorkerRequestEvent = {
		ctx,
		env,
		path: url.pathname.split('/').filter(Boolean),
		request,
		meta: nullMeta,
		url,
		cookies: new Cookies(request as any),
	};
	event.meta.isWebSocketConnect = request.headers.get('upgrade') === 'websocket';
	event.meta = await getMeta(config, event);
	return event;
};

export const createDurableRequestEvent = (request: DurableRequest, server: AnyDurableServer): DurableRequestEvent => {
	const url = new URL(request.url);
	return {
		server,
		meta: nullMeta,
		request,
		url: new URL(request.url),
		path: url.pathname.split('/').filter(Boolean),
		cookies: new Cookies(request),
	};
};
