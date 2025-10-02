import { StandardSchemaV1 } from './standard-schema';
import { Middleware, ReturnOfMiddlewares, useMiddlewares } from './middleware';
import { MaybePromise, OmitNever } from '../utils/types';
import { ProcedureType } from './procedure';
import { DynamicRequestEvent } from './requestEvent';
import { AnyRouter, Router } from './router';
import { error } from '../error';

export type HandlePayload<
	P extends ProcedureType,
	M extends Middleware<P>[] | undefined,
	S extends StandardSchemaV1 | undefined
> = OmitNever<{
	event: DynamicRequestEvent<P>;
	input: S extends StandardSchemaV1 ? StandardSchemaV1.InferInput<S> : never;
	ctx: ReturnOfMiddlewares<P, M>;
}>;

export type HandleFunction<P extends ProcedureType, M extends Middleware<P>[] | undefined, S extends StandardSchemaV1 | undefined> = (
	payload: HandlePayload<P, M, S>
) => MaybePromise<any>;

export class Handler<
	const H extends HandleFunction<P, M, S>,
	P extends ProcedureType,
	M extends Middleware<P>[] | undefined = undefined,
	S extends StandardSchemaV1 | undefined = undefined
> {
	handleFunction: H;
	procedureType: P;
	middlewares: M;
	schema: S;

	constructor(handleFunction: H, procedureType: P, middlewares: M, schema: S) {
		this.handleFunction = handleFunction;
		this.procedureType = procedureType;
		this.middlewares = middlewares;
		this.schema = schema;
	}

	call = async (event: DynamicRequestEvent<P>, input: S extends StandardSchemaV1 ? StandardSchemaV1.InferInput<S> : undefined) => {
		const ctx = this.middlewares ? await useMiddlewares(this.middlewares, event) : {};
		return this.handleFunction({ event, input, ctx } as HandlePayload<P, M, S>);
	};
}

const isHandler = (handler: any): handler is Handler<any, any, any, any> => {
	return 'call' in handler;
};

export const getHandler = <T extends boolean | undefined = true>(
	router: AnyRouter | undefined,
	path: string[],
	throwError: T
): T extends false ? Handler<any, any, any, any> | undefined : Handler<any, any, any, any> => {
	if (!router) {
		throw error('NOT_FOUND', 'router not found');
	}
	type H = AnyRouter | Handler<any, any, any, any> | undefined;
	let handler: H = router;
	path.forEach((segment) => {
		handler = handler?.[segment as keyof typeof handler] ? (handler?.[segment as keyof typeof handler] as H) : undefined;
	});

	if (!handler || !isHandler(handler)) {
		if (throwError) {
			throw error('NOT_FOUND', 'handler not found');
		}
		return undefined as T extends false ? Handler<any, any, any, any> | undefined : Handler<any, any, any, any>;
	}
	return handler;
};

export type AnyHandler = Handler<any, any, any, any>;
