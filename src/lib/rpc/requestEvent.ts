import { DurableServer, ServerOptions } from '.';
import { Cookies } from '../cookies';
import type { Request as CfRequest } from '@cloudflare/workers-types';
import { ProcedureType } from './procedure';
import { Register } from '..';
import { MaybePromise } from '../utils/types';

export type GetObjectJurisdictionOrLocationHint = (event: WorkerRequestEvent) => MaybePromise<{
	jurisdiction?: DurableObjectJurisdiction;
	locationHint?: DurableObjectLocationHint;
} | void>;

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
	name: string | null; // the durable object name
	id: string | null; // the durable object id
	jurisdiction: DurableObjectJurisdiction | null; // the durable object jurisdiction if specified
	locationHint: DurableObjectLocationHint | null; // the durable object location hint if specified
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
	ctx: DurableObjectState;
	env: Env;
};

export type DurableRequestEvent = {
	request: CfRequest;
	env: Env;
	ctx: DurableObjectState;
	path: string[];
	meta: Meta;
	url: URL;
	cookies: Cookies;
};

export type WebsocketOutputRequestEvent = {
	to: { session: Session; ws: WebSocket }[];
	env: Env;
	ctx: DurableObjectState;
};

export type WebsocketInputRequestEvent = {
	ws: WebSocket;
	session: Session;
	env: Env;
	ctx: DurableObjectState;
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

const getMetaFromRequest = async ({
	event,
	getObjectJurisdictionOrLocationHint,
}: {
	event: WorkerRequestEvent;
	getObjectJurisdictionOrLocationHint?: GetObjectJurisdictionOrLocationHint;
}): Promise<void> => {
	[event.meta.name, event.meta.id] = decodeURI(event.request.url)
		.match(/\/\(([^:]+):([^)]+)\)/)
		?.slice(1) || [null, null];

	if (event.meta.id === 'random') {
		event.meta.id = crypto.randomUUID();
	}

	if (event.meta.name && event.meta.id && getObjectJurisdictionOrLocationHint) {
		const localization = await getObjectJurisdictionOrLocationHint(event);
		Object.assign(event.meta, {
			jurisdiction: localization?.jurisdiction || null,
			locationHint: localization?.locationHint || null,
		});
	}
};

export const getJurisdictionalNamespace = (
	namespace: DurableObjectNamespace<DurableServer>,
	jurisdiction: DurableObjectJurisdiction | null
): DurableObjectNamespace<DurableServer> => {
	if (!jurisdiction) {
		return namespace;
	}
	try {
		return namespace.jurisdiction(jurisdiction);
	} catch (error) {
		// We must be in a dev env and the jurisdictional setting is not available
		return namespace;
	}
};

export const buildEvent = async (
	request: CfRequest,
	env: Env,
	ctx: ExecutionContext,
	opts: ServerOptions,
	server: string | null = null,
	isWebSocketConnect: boolean = false
): Promise<WorkerRequestEvent> => {
	const url = new URL(decodeURI(request.url));
	const clonedHeaders = new Headers(request.headers);

	if (isWebSocketConnect) {
		// Websockets lacks the headers object, so we need to parse the headers from the search params and append them to the headers object
		const searchParamsHeaders = JSON.parse(url.searchParams.get('headers') || '{}');
		Object.entries(searchParamsHeaders).forEach(([key, value]) => {
			clonedHeaders.append(key, value as string);
		});
		url.searchParams.delete('headers');
	}

	// no need to clone the request for normal requests
	const clonedRequest = isWebSocketConnect
		? (new Request(request as any, {
				headers: clonedHeaders,
		  }) as any)
		: request;

	const event = {
		ctx,
		env,
		path: [],
		request: clonedRequest,
		meta: { name: null, id: null, jurisdiction: null, locationHint: null },
		url,
		cookies: new Cookies(request as any),
	} satisfies WorkerRequestEvent;

	getPath(event);
	await getMetaFromRequest({ event, getObjectJurisdictionOrLocationHint: opts.getObjectJurisdictionOrLocationHint });

	return event;
};

export const getPath = (event: WorkerRequestEvent | DurableRequestEvent) => {
	let isObject = false;
	event.path = event.url.pathname.split('/').filter((part) => {
		if (!part) {
			return false;
		}
		if (part.match(/\(([^:]+):([^)]+)\)/)) {
			isObject = true;
			return false;
		}
		if (part.match(/\[([^\]]+)\]/)) {
			return false;
		}
		return true;
	});
	const method = event.request.method;
	if (method !== 'POST' && !isObject) {
		event.path.push(method.toLocaleLowerCase());
	}
};
