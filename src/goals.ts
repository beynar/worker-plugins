// What I want with this library is to create a simple way to extends cloudflare workers and Durable Objects with plugins

import { AnyRouter } from './src/lib/rpc/router';

type WorkerPlugin = {
	// Plugin name, for debugging purposes
	name?: string;
	// Path for which the plugin hooks will run (except for rpc methods that will run for any path)
	path?: string;
	// Hooks that will run before anything else
	onFetch?: (request: Request) => Promise<Response>;
	// Cron handler
	onCron?: (cron: string) => Promise<void>;
	// Queue handler
	queues?: AnyRouter;
	// Hooks that will run before anything
	before?: (request: Request) => Promise<Response>;
	// Hooks that will run after the rpc handler
	after?: (response: Response) => Promise<Response>;
	// Durable Object access handler
	onDurableObjectAccess?: (request: Request) => Promise<Response>;
	// Rpc router that ship by default with the worker
	rpc?: AnyRouter;
	// Any context that will be passed around in the worker
};

type DurableObjectPlugin = {
	name?: string;
	onFetch?: (request: Request) => Promise<Response>;
	onWebSocketClose?: (ws: WebSocket) => Promise<void>;
	onWebSocketError?: (ws: WebSocket) => Promise<void>;
	onWebSocketMessage?: (ws: WebSocket) => Promise<void>;
	onWebSocketOpen?: (ws: WebSocket) => Promise<void>;
	requestEvent?: () => any; // any contextt that will be passed around in the durable object
	onAlarm?: (alarm: any) => Promise<void>;
	rpc?: AnyRouter; // rpc router that ship by default with the durable object
	webSocketMessages?: {
		in: AnyRouter; //rpc style router for the web socket messages
		out: AnyRouter; //rpc style router for the web socket messages
	};
	expose?: Record<string, any>;
};

// The worker should handle by default rpc calls, connections to the durable object websockets etc.

// The type system inside the durable object should be augmented with any of the plugins that are loaded (with the documents, the rpc and the expose)

// It should look like this:

// worker.ts
import { WorkerPlugin, createWorker, createDurableObjectWithPlugins } from 'worker-plugins';

const plugin = new WorkerPlugin({
	name: 'hello',
	path: 'worker.ts',
});

export const worker = createWorker([plugin]);

const workerRouter = worker.createRouter('worker');
const router = {
	test: workerRouter
		.procedure()
		.input(z.string())
		.handle(({ input }) => {
			//
		}),
};

const api = worker.api({
	router,
});

export type API = typeof api.infer;
export default api;

const durablePlugin = new DurableObjectPlugin({
	name: 'world',
	expose: {
		methodFromPlugin: () => 'Hello, World!',
	},
});
export class MyDurableObject extends createDurableObjectWithPlugins([durablePlugin]) {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	async sayHello(name: string): Promise<string> {
		return `Hello, ${name}!`;
		this.methodFromPlugin(); // should be defined
	}
}
