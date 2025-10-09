import { any } from 'zod/mini';

import { worker } from './worker';

export const externalRouter = (route: typeof worker.route) => {
	return {
		test: route.input(any()).handle(async ({ event }) => {
			return {
				external: 'coucou',
			};
		}),
	};
};
