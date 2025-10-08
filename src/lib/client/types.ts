import { DurableServerConstructor } from '../durable/object';
import { AnyDurableInfer } from '../durable/plugin';
import { AnyRouter } from '../rpc';
import type { Handler } from '../rpc/handler';
import { StandardSchemaV1 } from '../rpc/standard-schema';

export type RouterOf<DO extends DurableServerConstructor, T extends 'router' | 'ws_out' | 'ws_in' | 'tasks'> = DO extends new (
	ctx: DurableObjectState,
	env: Env
) => infer D
	? D extends { ['~infer']: infer Infer extends AnyDurableInfer }
		? Infer[T]
		: never
	: never;

export type MessageHandlers<Router extends AnyRouter> = {
	[K in keyof Router]?: Router[K] extends AnyRouter
		? MessageHandlers<Router[K]>
		: Router[K] extends Handler<infer H, any, any, infer S>
		? (result: { data: S extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<S> : never; ctx: Awaited<ReturnType<H>> }) => void
		: never;
};
