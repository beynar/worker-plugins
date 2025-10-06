import { createRouter } from './lib/rpc/router';
import { any, string } from 'zod';
import { createDurableObject, DurablePlugin } from './lib/durable/plugin';
import { AnyDurableServer } from './lib/durable/object';

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
			.input(any())
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
			.input(any())
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
				return {
					data: 'coucou',
				};
			}),
	},
} satisfies DurablePlugin;

const plugins = [Plugin1, Plugin2];
export class MyDurableObject extends createDurableObject(...plugins)<MyDurableObject> {
	ws_out = {
		test4: w
			.procedure()
			.input(any())
			.handle(async (input) => {
				return `coucou ${input}`;
			}),
	};

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	sayHello(s: string) {
		const t = this.get('test');
		return t;
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

const objects = {
	test: MyDurableObject,
};

type InferDurableServer<T> = T extends new (ctx: DurableObjectState, env: Env) => infer R
	? R extends AnyDurableServer
		? R['infer']
		: never
	: never;

type T = InferDurableServer<typeof objects.test>;

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const stub = env.MY_DURABLE_OBJECT.getByName('foo');
		const greeting = await stub.sayHello('world');

		return new Response(greeting);
	},
} satisfies ExportedHandler<Env>;
