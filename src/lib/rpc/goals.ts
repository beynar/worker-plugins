// Goal:
import { z } from 'zod';
import { createRouter } from './router';

// - have a trpc like rpc system
// - have a way to define the rpc methods in the durable object
// - have a way to define the rpc methods in the worker
// - have a way to define the rpc methods for in and out websockets messages
// - have a unified way to define the rpc routers and methods for the worker and the durable object

// First: have a createRouter function that returns a different router depending on the context (worker or durable object or websocket)

// Design of the createRouter function:

// - should be a function that returns a router
// - it should have a createContext function that returns a context that will populate the handlers
// - it should only return a .procedure function to define the handlers

// Example:

const workerRouter = createRouter('worker').use(() => {
	return {
		contextValue: 'hello',
	};
});

const workerProcedure = workerRouter
	.procedure()
	// .use(() => {
	// 	// some middleware function populating the context
	// })
	.input(
		z.object({
			test: z.string(),
		})
	);
