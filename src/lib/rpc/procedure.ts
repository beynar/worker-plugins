import { StandardSchemaV1 } from './standard-schema';
import { HandleFunction, Handler } from './handler';
import { Middleware, ReturnOfMiddlewares } from './middleware';
import { object } from 'zod';
import { createRouter } from './router';

export type ProcedureType = 'worker' | 'queue' | 'durable' | 'in' | 'out' | 'schedule';

export class Procedure<P extends ProcedureType, M extends Middleware<P>[] | undefined = undefined> {
	private middlewares: M;
	private procedureType: P;

	constructor(procedureType: P, middlewares: M) {
		this.procedureType = procedureType;
		this.middlewares = middlewares;
	}

	use = <const NewM extends Middleware<P>[]>(...middlewares: NewM) => {
		return new Procedure(this.procedureType, this.middlewares ? this.middlewares.concat(middlewares) : middlewares) as Procedure<
			P,
			M extends Middleware<P>[] ? [...M, ...NewM] : NewM
		>;
	};

	input = <S extends StandardSchemaV1>(schema: S) => {
		return {
			handle: <H extends HandleFunction<P, M, S>>(handleFunction: H) => {
				return new Handler(handleFunction, this.procedureType, this.middlewares, schema) as Handler<H, P, M, S>;
			},
		};
	};

	handle = <H extends HandleFunction<P, M, undefined>>(handleFunction: H) => {
		return new Handler(handleFunction, this.procedureType, this.middlewares, undefined) as Handler<H, P, M, undefined>;
	};
}

const t2 = createRouter('worker').use(() => {
	return {
		ok: true,
	};
});
type T = (typeof t2)['middlewares'];

type R = ReturnOfMiddlewares<'worker', T>;
t2.procedure()
	.input(object({}))
	.handle(({ ctx }) => {
		const te = ctx.ok;
	});
