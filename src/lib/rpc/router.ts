import { Handler } from './handler';
import { Middleware } from './middleware';
import { Procedure, ProcedureType } from './procedure';

export const createRouter = <T extends ProcedureType>(procedureType: T) => {
	return new Router(procedureType, undefined);
};

export class Router<T extends ProcedureType, M extends Middleware<T>[] | undefined = undefined> {
	declare procedureType: T;
	declare middlewares: M;

	constructor(procedureType: T, middlewares: M) {
		this.procedureType = procedureType;
		this.middlewares = middlewares;
	}

	use = <const NewM extends Middleware<T>[]>(...middlewares: NewM) => {
		return new Router(this.procedureType, this.middlewares ? this.middlewares.concat(middlewares) : middlewares) as Router<
			T,
			M extends Middleware<T>[] ? [...M, ...NewM] : NewM
		>;
	};

	procedure = () => {
		return new Procedure(this.procedureType, this.middlewares);
	};
}

export type AnyRouter = {
	[K in string]: Handler<any, any, any, any> | AnyRouter;
};

export type MergeRouter<A extends AnyRouter, B extends AnyRouter> = {
	[K in keyof A | keyof B]: K extends keyof B ? B[K] : K extends keyof A ? A[K] : never;
};

export type MergeRouters<R, Current extends AnyRouter | undefined = undefined> = R extends AnyRouter[]
	? R extends [infer Head, ...infer Tail]
		? Head extends AnyRouter
			? Tail extends AnyRouter[]
				? MergeRouters<Tail, Current extends AnyRouter ? MergeRouter<Current, Head> : Head>
				: Current extends AnyRouter
				? MergeRouter<Current, Head>
				: Head
			: Current
		: Current
	: never;

export const mergeRouters = <R extends AnyRouter[]>(...routers: R): MergeRouters<R> => {
	return routers.reduce((acc, router) => {
		return {
			...acc,
			...router,
		};
	}, {} as MergeRouters<R>);
};
