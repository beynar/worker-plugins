import { withCookies } from '../cookies';
import { buildEvent } from '../rpc';
import { Worker, WorkerConfig } from '../worker/worker';

export async function fetch(this: Worker<WorkerConfig>, request: Request, env: Env, ctx: ExecutionContext) {
	const isWebSocketConnect = request.headers.get('Upgrade') === 'websocket';
	const event = await buildEvent(request as any, env, ctx, this.config, null, isWebSocketConnect);
	const stub = await getDurableServer({ event, objects: opts.objects });

	let response: Response | undefined;
	$: try {
		// if (isPathExcluded(event, opts.exclude)) {
		// 	throw new FLARERROR('NOT_FOUND');
		// }

		for (let handler of this.config.before || [] || []) {
			response = (await handler(event)) ?? response;
			if (response) break $;
		}

		if (stub && event.meta?.name && event.meta?.id) {
			// @ts-ignore
			response = await stub.fetch(event.request, {
				cf: {
					...request.cf,
					meta: event.meta,
					isWebSocketConnect,
				},
			});
			if (isWebSocketConnect) {
				return response;
			}
		} else {
			response = await handleRequest(event, opts.router);
		}
	} catch (error) {
		this.config.onError?.({ error, event });
		response = handleError(error);
	}

	for (let handler of this.config.after || [] || []) {
		response = (await handler(response!, event)) ?? response;
	}

	return withCookies(response!, event);
}
