import { type MaybePromise } from '../utils/types';
import { ConnectOptions, createWebSocketConnection, SendAPI, WebSocketClient } from './websocket';
import { tryParse } from '../utils';
import { deform, form, parse } from '../json';
import { createApiProxy, ProxyOutput } from './proxies';
import { Worker } from '../worker';
import { API } from '../rpc/api';
import { AnyWorkerInfer } from '../worker/worker';
import { DurableServerConstructor } from '../durable/object';
import { AnyRouter } from '../rpc';
import { AnyDurableInfer, RestrictedDurableObject } from '../durable/plugin';
import { RouterOf } from './types';

type DurableObjectAPI<DO extends DurableServerConstructor> = API<RouterOf<DO, 'router'>>;

type ClientAPI<W extends AnyWorkerInfer> = API<W['router']> & {
	[O in keyof W['objects']]: (id?: 'random' | 'default' | (string & {})) => DurableObjectAPI<W['objects'][O][0]> & {
		connect: (opts: ConnectOptions<RouterOf<W['objects'][O][0], 'ws_out'>>) => WebSocketClient<W['objects'][O][0]>;
	};
};

export type ErrorResponse = {
	status?: number;
	statusText?: string;
	message?: any;
} & {};

export type ClientOptions = {
	endpoint: string;
	throwOnError?: boolean;
	headers?: HeadersInit | (<I = unknown>({ path, input }: { path: string; input: I }) => MaybePromise<HeadersInit>);
	fetch?: typeof fetch;
	onError?: (error: ErrorResponse, response: Response) => void;
	onResponse?: (response: Response) => void;
	includeCredentials?: boolean;
	server?: string;
	jsonMode?: boolean;
};

const defaultOptions = {
	endpoint: 'https://flarepc.com',
	throwOnError: false,
	headers: {} as HeadersInit,
	fetch: fetch,
	onError: () => {},
};

export const createClient = <W extends AnyWorkerInfer>({
	endpoint = defaultOptions.endpoint,
	throwOnError = false,
	headers: customHeaders = defaultOptions.headers,
	fetch: f = defaultOptions.fetch,
	onError = defaultOptions.onError,
	onResponse,
	server,
	includeCredentials = true,
	jsonMode = false,
}: ClientOptions = defaultOptions) => {
	return createApiProxy(async ({ path, payload, object, callbackFunction }) => {
		const url = new URL(endpoint);
		if (server) {
			path.unshift(`[${server}]`);
		}

		const headers = Object.assign(
			{
				'x-flarepc-client': jsonMode ? 'json' : 'form',
			},
			typeof customHeaders === 'function'
				? await customHeaders({
						path: path.join('/'),
						input: payload,
				  })
				: customHeaders
		) satisfies HeadersInit;

		url.pathname = path.join('/');
		if (object.websocket) {
			return createWebSocketConnection(url, payload, headers);
		}

		let method = 'POST';
		const maybeVerb = path[path.length - 1];
		const verbs = new Set(['get', 'put', 'delete', 'patch']);
		if (verbs.has(maybeVerb)) {
			path.pop();
			method = maybeVerb.toUpperCase();
		}
		if (method === 'GET') {
			url.search = new URLSearchParams(JSON.stringify(payload)).toString();
		}

		return f(url, {
			method,
			body: method === 'GET' ? undefined : form(payload),
			// @ts-ignore
			...(includeCredentials
				? {
						credentials: 'include',
				  }
				: {}),

			headers,
		}).then(async (res) => {
			onResponse?.(res as any);
			if (res.status !== 200) {
				const error = {
					// @ts-ignore
					...(await res.clone().json()),
					status: res.status,
					statusText: res.statusText,
				};
				onError?.(
					error,

					res.clone() as any
				);
				if (throwOnError) {
					throw new Error(res.statusText);
				} else {
					return [null, error];
				}
			} else {
				const contentType = res.headers.get('content-type');
				if (contentType === 'text/event-stream') {
					const reader = res.body!.getReader();
					const decoder = new TextDecoder();
					let buffer = '';
					let first = true;
					const callback = (chunk: string, done: boolean) => {
						if (done) {
							return;
						}
						const lines = (buffer + chunk).split('\n');
						buffer = lines.pop()!;
						lines.forEach((line, i) => {
							if (first && i === 0 && line === '') {
								return;
							}
							(callbackFunction as any)({
								chunk: tryParse(line),
								first,
							});
							first = false;
						});
					};
					while (true) {
						const { done, value } = await reader.read();
						if (done) {
							break;
						}
						callback(decoder.decode(value), done);
					}
				} else if (contentType?.includes('multipart/form-data')) {
					const formData = await res.formData();
					return [deform(formData as FormData), null];
				} else if (jsonMode) {
					return [parse(await res.text()), null];
				}
			}
		});
	}) as ClientAPI<W>;
};
