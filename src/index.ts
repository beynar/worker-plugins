import { AnyRouter, createRouter } from './lib/rpc/router';
import { any, string } from 'zod/mini';
import { AnyDurableInfer, createDurableObject, DurablePlugin } from './lib/durable/plugin';
import { AnyDurableServer, DurableServerConstructor } from './lib/durable/object';
import { createWorker } from './lib/worker/worker';
import { createClient } from './lib/client/api';
import { ConnectOptions } from './lib/client/websocket';

/**
 * Welcome to Cloudflare Workers! This is your first Durable Objects application.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your Durable Object in action
 * - Run `npm run deploy` to publish your application
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/durable-objects
 */

/** A Durable Object's behavior is defined in an exported Javascript class */

const t = createRouter('worker');
const w = createRouter('out');

const Plugin1 = {
	router: {
		test1: t
			.procedure()
			.input(string())
			.handle(async () => {
				return 'coucou';
			}),
	},
	ws_out: {
		test1: t
			.procedure()
			.input(string())
			.handle(async () => {
				return 'coucou';
			}),
	},

	expose: {
		test1: 'hello',
		caca1: true,
	},
};

const Plugin2 = {
	router: {
		test2: t
			.procedure()
			.input(any())
			.handle(async () => {
				return 'coucou';
			}),
	},
	ws_out: {
		test: w
			.procedure()
			.input(string())
			.handle(async () => {
				return {
					data: 'coucou',
				};
			}),
	},
	expose: {
		test: 'hello',
		caca: true,
	},
	tasks: {
		task1: w
			.procedure()
			.input(any())
			.handle(async () => {
				// const stub = await
				return {
					data: 'coucou',
				};
			}),
	},
} satisfies DurablePlugin;

const plugins = [Plugin1, Plugin2];
export class MyDurableObject extends createDurableObject(...plugins)<MyDurableObject> {
	ws_out = {
		ws_out: w
			.procedure()
			.input(any())
			.handle(async ({ input }) => {
				return `coucou ${input}`;
			}),
		nested_ws_out: {
			nested_ws_out: w
				.procedure()
				.input(any())
				.handle(async ({ input }) => {
					return `coucou ${input}`;
				}),
		},
	};
	ws_in = {
		ws_in: w
			.procedure()
			.input(any())
			.handle(async ({ input }) => {
				return `coucou ${input}`;
			}),
	};

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	sayHello(name: string) {
		return `hello ${name}`;
	}

	router = {
		test: createRouter('worker')
			.procedure()
			.input(any())
			.handle(async () => {
				return 'coucou';
			}),
	};
}

const pluginRouter = {
	test2: createRouter('worker')
		.procedure()
		.input(any())
		.handle(async ({ event }) => {
			const stub = event.env.MY_DURABLE_OBJECT;

			// return stub.getByName('DEFAULT').sayHello('John');
			return stub.getByName('DEFAULT').sayHello('John');
		}),
};

const worker = createWorker()
	.use({
		router: pluginRouter,
	})
	.router((t) => {
		return {
			test: t.input(any()).handle(async ({ event }) => {
				const stub = event.env.MY_DURABLE_OBJECT;
				return stub.getByName('DEFAULT').sayHello('John');
			}),
			nested: {
				nested: t.input(any()).handle(async ({ event }) => {
					const stub = event.env.MY_DURABLE_OBJECT;
					return stub.getByName('DEFAULT').sayHello('John');
				}),
			},
		};
	})
	.object('MY_DURABLE_OBJECT', MyDurableObject, 'afr');

export default worker.entrypoint;

type T = (typeof worker)['~infer']['objects'];

const client = createClient<(typeof worker)['~infer']>();

const [res, error] = await client.MY_DURABLE_OBJECT('').test1('e');
const ws = await client.MY_DURABLE_OBJECT('').connect({
	handlers: {
		test: ({ data, ctx }) => {
			console.log(data);
		},
		nested_ws_out: {
			nested_ws_out: ({ data, ctx }) => {},
		},
	},
});

export type RouterOf<DO extends DurableServerConstructor, T extends 'router' | 'ws_out' | 'ws_in' | 'tasks'> = DO extends new (
	ctx: DurableObjectState,
	env: Env
) => infer D
	? D extends { ['~infer']: infer Infer extends AnyDurableInfer }
		? Infer[T]
		: never
	: never;

type T2 = typeof MyDurableObject extends new (ctx: any, env: any) => infer D
	? D extends { ['~infer']: infer Infer extends AnyDurableInfer }
		? Infer['ws_out']
		: never
	: never;
type T3 = RouterOf<typeof MyDurableObject, 'ws_out'>;
