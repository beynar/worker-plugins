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
