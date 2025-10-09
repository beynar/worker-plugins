import { createRouter } from './lib/rpc/router';
import { any, string } from 'zod/mini';
import { createDurableObject, DurablePlugin } from './lib/durable/plugin';
import { createWorker } from './lib/worker/worker';

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
	ws_in: {
		fart: w
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
	ws_in: {
		prout: w
			.procedure()
			.input(string())
			.handle(async () => {
				return 'coucou';
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
const pluginRouter2 = {
	test3: createRouter('worker')
		.procedure()
		.input(any())
		.handle(async ({ event }) => {
			const stub = event.env.MY_DURABLE_OBJECT;

			// return stub.getByName('DEFAULT').sayHello('John');
			return stub.getByName('DEFAULT').sayHello('John');
		}),
};
const pluginRouter3 = {
	test3: createRouter('worker')
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
	.use({
		router: pluginRouter2,
	})
	.use({
		queues: pluginRouter3,
	})
	.router((t) => {
		return {
			test: t.input(string()).handle(async ({ event }) => {
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
	.queues('MY_QUEUE', (t) => {
		return {
			test: t.input(any()).handle(async ({ event }) => {
				return 'coucou';
			}),
		};
	})
	.queues('MY_QUEUE', (t) => {
		return {
			test2: t.input(any()).handle(async ({ event }) => {
				return 'coucou';
			}),
		};
	})
	.object('MY_DURABLE_OBJECT', MyDurableObject, 'afr');

export default worker.entrypoint;

export { worker };

type API = (typeof worker)['~infer'];
// const client = createClient<(typeof worker)['~infer']>();
// type T3 = T['router'];
// type TP = T['plugins'];

// const ws = await client.MY_DURABLE_OBJECT('id').connect({});

// const [res, error] = await ws.send.fart('ez');

// type T2 = typeof ws.send;

// const x = new MyDurableObject({} as DurableObjectState, {} as Env);

// type InferP = (typeof x)['~infer']['plugins'];
