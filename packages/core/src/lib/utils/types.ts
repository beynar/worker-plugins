import { DurableServerConstructor } from '../durable/object';
import { AnyDurableInfer, AnyRestrictedDurableObject } from '../durable/plugin';
import { AnyRouter } from '../rpc';

export type OmitNever<T> = Pick<
	T,
	{
		[K in keyof T]: T[K] extends never ? never : K;
	}[keyof T]
>;

export type MaybePromise<T> = T | Promise<T>;

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

export type ExtractFunctions<T> = {
	[K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

export type IfDefined<T, F = never> = T extends undefined ? F : T;

export type Defined<T> = Exclude<T, undefined>;

export type IntersectArrayProp<T extends any[], key extends keyof T[number], Acc extends Record<string, any> = {}> = T extends [
	infer Head,
	...infer Tail
]
	? Head[key] extends Record<string, any>
		? IntersectArrayProp<Tail, key, Acc & Head[key]>
		: IntersectArrayProp<Tail, key, Acc>
	: Acc;

export type SafeReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

export type Get<T, K extends string> = K extends `${infer P}.${infer Rest}`
	? P extends keyof T
		? Get<T[P], Rest>
		: never
	: K extends keyof T
	? T[K]
	: never;

export type RouterOf<DO extends DurableServerConstructor, T extends 'router' | 'ws_out' | 'ws_in' | 'tasks'> = DO extends new (
	ctx: DurableObjectState,
	env: Env
) => infer D
	? D extends { ['~infer']: infer Infer extends AnyDurableInfer }
		? Infer[T]
		: never
	: never;

type AnyPlugin = {
	router?: AnyRouter;
	ws_in?: AnyRouter;
	ws_out?: AnyRouter;
	tasks?: AnyRouter;
	queues?: AnyRouter;
	expose?: Record<string, any>;
};

type AnyConfig = {
	router?: AnyRouter;
	ws_in?: AnyRouter;
	ws_out?: AnyRouter;
	tasks?: AnyRouter;
	queues?: AnyRouter;
};
type MergeWorkerRouters<
	D extends AnyConfig,
	Plugins extends AnyPlugin[] | undefined,
	key extends 'router' | 'ws_in' | 'ws_out' | 'tasks' | 'queues'
> = D[key] extends AnyRouter ? (Plugins extends AnyPlugin[] ? IntersectArrayProp<Plugins, key> & D[key] : D[key]) : never;

type MergeDurableObjectRouters<
	D extends AnyConfig,
	Plugins extends AnyPlugin[] | undefined,
	key extends 'router' | 'ws_in' | 'ws_out' | 'tasks' | 'queues'
> = D[key] extends AnyRouter
	? Plugins extends AnyPlugin[]
		? UnionToIntersection<Exclude<Plugins[number][key], undefined>> & D[key]
		: D[key]
	: never;

// Single interface to merge routers wether its a worker or a durable object. This to clarify the code a little bit.
export type MergeRouters<
	D extends AnyConfig,
	Plugins extends AnyPlugin[] | undefined,
	key extends 'router' | 'ws_in' | 'ws_out' | 'tasks' | 'queues'
> = D extends AnyRestrictedDurableObject ? MergeDurableObjectRouters<D, Plugins, key> : MergeWorkerRouters<D, Plugins, key>;

export type MergeExpose<Plugins extends AnyPlugin[] | undefined> = Plugins extends AnyPlugin[]
	? IntersectArrayProp<Plugins, 'expose'>
	: undefined;
