import { DurableServerConstructor } from '../durable/object';
import { AnyDurableInfer } from '../durable/plugin';

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
	: 'never';

export type RouterOf<DO extends DurableServerConstructor, T extends 'router' | 'ws_out' | 'ws_in' | 'tasks'> = DO extends new (
	ctx: DurableObjectState,
	env: Env
) => infer D
	? D extends { ['~infer']: infer Infer extends AnyDurableInfer }
		? Infer[T]
		: never
	: never;
