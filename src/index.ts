import { DurableObject } from 'cloudflare:workers';
import { createRouter } from './lib/rpc/router';
import { any } from 'zod';
import { createDurableObject, DurablePlugin } from './lib/durable/plugin';

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

class Plugin1 extends DurablePlugin {
	router = {
		test1: t
			.procedure()
			.input(any())
			.handle(async () => {
				return 'coucou';
			}),
	};
	ws_out = {
		test1: t
			.procedure()
			.input(any())
			.handle(async () => {
				return 'coucou';
			}),
	};
}

class Plugin2 extends DurablePlugin {
	router = {
		test2: t
			.procedure()
			.input(any())
			.handle(async () => {
				return 'coucou';
			}),
	};
	ws_out = {
		test: w
			.procedure()
			.input(any())
			.handle(async () => {
				return {
					data: 'coucou',
				};
			}),
	};
}

const plugins = [new Plugin1(), new Plugin2()];
export class MyDurableObject extends createDurableObject(...plugins)<MyDurableObject> {
	// ws_out = {
	// 	test4: w
	// 		.procedure()
	// 		.input(string())
	// 		.handle(async (input) => {
	// 			return `coucou ${input}`;
	// 		}),
	// };

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		// const t = this.ws.send.test('coucou', { to: ['elzk'] });
	}

	sayHello(s: string) {
		return 'coucou';
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

export default {
	/**
	 * This is the standard fetch handler for a Cloudflare Worker
	 *
	 * @param request - The request submitted to the Worker from the client
	 * @param env - The interface to reference bindings declared in wrangler.jsonc
	 * @param ctx - The execution context of the Worker
	 * @returns The response to be sent back to the client
	 */
	async fetch(request, env, ctx): Promise<Response> {
		// Create a stub to open a communication channel with the Durable Object
		// instance named "foo".
		//
		// Requests from all Workers to the Durable Object instance named "foo"
		// will go to a single remote Durable Object instance.
		const stub = env.MY_DURABLE_OBJECT.getByName('foo');

		// Call the `sayHello()` RPC method on the stub to invoke the method on
		// the remote Durable Object instance.
		const greeting = await stub.sayHello('world');

		return new Response(greeting);
	},
} satisfies ExportedHandler<Env>;
