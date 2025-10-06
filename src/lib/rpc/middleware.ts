import { MaybePromise } from '../utils/types';
import { ProcedureType } from './procedure';
import { DynamicRequestEvent } from './requestEvent';

export type Middleware<P extends ProcedureType, R = any> = (event: DynamicRequestEvent<P>) => MaybePromise<R>;

export type ReturnOfMiddlewares<
	P extends ProcedureType,
	Use extends Middleware<P>[] | undefined,
	PreviousData = unknown
> = Use extends Middleware<P>[]
	? Use extends [infer Head, ...infer Tail]
		? Head extends Middleware<P, infer HeadData>
			? Tail extends Middleware<P, infer TD>[]
				? PreviousData & HeadData & ReturnOfMiddlewares<P, Tail, PreviousData & HeadData>
				: HeadData & PreviousData
			: PreviousData
		: PreviousData
	: never;

export const useMiddlewares = async <P extends ProcedureType, M extends Middleware<P>[]>(
	middlewares: M,
	event: DynamicRequestEvent<P>
): Promise<ReturnOfMiddlewares<P, M>> => {
	const data = {};
	if (middlewares) {
		for (const middleware of middlewares) {
			Object.assign(data, await middleware(event));
		}
	}
	return data as ReturnOfMiddlewares<P, M>;
};
