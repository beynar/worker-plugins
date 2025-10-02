import z from 'zod';
import { Handler } from './handler';
import { Middleware } from './middleware';
import { Procedure, ProcedureType } from './procedure';
import { API } from './api';

export const createRouter = (procedureType: ProcedureType = 'worker') => {
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

export type AnyRouter = Record<string, Handler<any, any, any, any>>;

export type MergeRouter<A extends AnyRouter, B extends AnyRouter> = {
	[K in keyof A | keyof B]: K extends keyof B ? B[K] : K extends keyof A ? A[K] : never;
};

export type MergeRouters<R extends AnyRouter[], Current extends AnyRouter | undefined = undefined> = R extends [infer Head, ...infer Tail]
	? Head extends AnyRouter
		? Tail extends AnyRouter[]
			? MergeRouters<Tail, Current extends AnyRouter ? MergeRouter<Current, Head> : Head>
			: Current extends AnyRouter
			? MergeRouter<Current, Head>
			: Head
		: Current
	: Current;

export const mergeRouters = <R extends AnyRouter[]>(...routers: R) => {
	return routers.reduce((acc, router) => {
		return {
			...acc,
			...router,
		};
	}, {} as MergeRouters<R>);
};

const r = createRouter('schedule');
const a = {
	a: r
		.procedure()
		.input(
			z.object({
				a: z.string(),
			})
		)
		.handle(() => {
			return {
				a: 'a',
			};
		}),
	b: r
		.procedure()
		.input(
			z.object({
				b: z.string(),
			})
		)
		.handle(() => {
			return {
				b: 'b',
			};
		}),
};
const b = {
	b: r
		.procedure()
		.input(
			z.object({
				c: z.string(),
			})
		)
		.handle(() => {
			return {
				c: 'b',
			};
		}),
	d: r
		.procedure()
		.input(
			z.object({
				d: z.string(),
			})
		)
		.handle(() => {
			return {
				d: 'd',
			};
		}),
};

const merged = mergeRouters(a, b);
const x = {} as API<typeof merged>;

const [re] = await x.b({ c: 'z' });
