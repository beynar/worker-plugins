import { ErrorResponse } from '../error';
import { MaybePromise } from '../utils/types';
import { validate } from '../utils/validate';
import { AnyHandler, getHandler, Handler } from './handler';
import { AnyRouter } from './router';
import { StandardSchemaV1 } from './standard-schema';

export type ApiResult<T> = Promise<[Awaited<T>, null] | [null, ErrorResponse]>;

export type StreamCallback<S = any> = ({ chunk, first }: { chunk: S; first: boolean }) => void;

type WithOpts<Func extends (...args: any[]) => any, Opts extends StandardSchemaV1 | undefined = undefined> = Opts extends StandardSchemaV1
	? StandardSchemaV1.InferInput<Opts> extends infer T | undefined
		? (p: Parameters<Func>[0], opts?: T) => ReturnType<Func>
		: (p: Parameters<Func>[0], opts: StandardSchemaV1.InferInput<Opts>) => ReturnType<Func>
	: Func;

export type API<R extends AnyRouter = AnyRouter, Opts extends StandardSchemaV1 | undefined = undefined> = {
	[K in keyof R]: R[K] extends Handler<infer H, infer M, infer P, infer S>
		? S extends StandardSchemaV1
			? ReturnType<H> extends Promise<ReadableStream<infer C>>
				? (payload: StandardSchemaV1.InferInput<S>, callback: StreamCallback<C>) => void
				: WithOpts<(payload: StandardSchemaV1.InferInput<S>) => Promise<ApiResult<ReturnType<H>>>, Opts>
			: ReturnType<H> extends Promise<ReadableStream<infer C>>
			? WithOpts<(callback: StreamCallback<C>) => void, Opts>
			: () => Promise<ApiResult<ReturnType<H>>>
		: R[K] extends AnyRouter
		? API<R[K], Opts>
		: R[K];
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

const isAnyRouter = (router: AnyRouter | undefined): router is AnyRouter => {
	return router !== undefined;
};

export const createApi = <R extends AnyRouter | undefined, Opts extends StandardSchemaV1 | undefined = undefined>({
	router,
	callback,
	options,
}: {
	router?: R;
	options?: Opts;
	callback: (opts: Parameters<RecursiveProxyCallback<Opts>>[0] & { handler: AnyHandler }) => MaybePromise<void>;
}): R extends undefined ? never : R extends AnyRouter ? API<R, Opts> : never => {
	if (!isAnyRouter(router)) return {} as never;
	return recursiveProxy<Opts>(async ({ type, path, data, opts }) => {
		const handler = getHandler(router, path, true);
		const parsedData = await validate(handler.schema, data);
		const parsedOptions = options ? await validate(options, opts) : undefined;

		return callback({
			type,
			path,
			data: parsedData,
			opts: parsedOptions as Opts extends StandardSchemaV1 ? StandardSchemaV1.InferInput<Opts> : never,
			handler,
		});
	}) as R extends undefined ? never : R extends AnyRouter ? API<R, Opts> : never;
};
