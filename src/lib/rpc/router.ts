import { Handler } from './handler';
import { Middleware } from './middleware';
import { Procedure, ProcedureType } from './procedure';

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
