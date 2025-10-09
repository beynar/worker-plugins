import { StandardSchemaV1 } from '../rpc/standard-schema';

export type ClientMeta = {
	name: string | null;
	id: string | null;
	server: string | null;
	call: boolean;
	websocket: boolean;
	doc: boolean;
};

export type ProxyOutput = { path: string[]; payload: any; object: ClientMeta; callbackFunction: any };
const defaultObject = () =>
	({
		name: null,
		id: null,
		server: null,
		call: false,
		websocket: false,
		doc: false,
	} satisfies ClientMeta);

export const createApiProxy = (
	callback: (output: ProxyOutput) => unknown,
	object: ClientMeta = defaultObject(),
	path: string[] = [],
	payload: unknown[] = [],
	callbackFunction: any = null
) => {
	const proxy: unknown = new Proxy(() => {}, {
		get(_obj, key) {
			if (path.length === 0) {
				object = defaultObject();
			}
			if (typeof key !== 'string') return undefined;

			if (key === 'then') {
				const isConnect = path[path.length - 1] === 'connect';
				const isDoc = path[path.length - 1] === 'doc';
				// mean that it's the last path and the api is effectively called
				if (!object.call) {
					object.name = null;
					object.id = null;
				}
				// If connect is called on the object, it means that we're are trying to connect to a websocket
				object.websocket = isConnect;
				object.doc = isDoc;

				if (object.call || isConnect || isDoc) {
					path[0] = `(${object.name}:${object.id})`;
				}
				return (resolve: (value: any) => void, reject: (reason?: any) => void) => {
					return resolve(
						callback({
							path,
							payload,
							object,
							callbackFunction,
						})
					);
				};
			}

			return createApiProxy(callback, object, [...path, key], payload, callbackFunction);
		},
		apply(_1, _2, args) {
			if (!object.id) {
				object.name = path[path.length - 1];
				object.id = args[0] || 'DEFAULT';
			} else {
				object.call = true;
			}
			return createApiProxy(callback, object, path, args[0], args[1]);
		},
	});
	return proxy;
};

export type RecursiveProxyCallback<Opts extends StandardSchemaV1 | undefined = undefined> = (opts: {
	type: string;
	path: string[];
	data: unknown;
	opts: Opts extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<Opts> : never;
}) => unknown;

export const recursiveProxy = <Opts extends StandardSchemaV1 | undefined = undefined>(
	callback: RecursiveProxyCallback<Opts>,
	path: string[] = []
) => {
	const proxy: unknown = new Proxy(() => {}, {
		get(_obj, key) {
			if (typeof key !== 'string') return undefined;
			return recursiveProxy(callback, [...path, key]);
		},
		apply(_1, _2, args) {
			return callback({
				type: path.join('.'),
				path,
				data: args[0],
				opts: args[1],
			});
		},
	});
	return proxy;
};
