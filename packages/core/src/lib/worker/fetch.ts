import { withCookies } from '../cookies';
import { AnyDurableServer } from '../durable';
import { FLARERROR, handleError } from '../error';
import { createWorkerEvent, JurisdictionOrLocationHint, WorkerRequestEvent } from '../rpc';
import { handleRequest } from '../rpc/handler';
import { WorkerConfig } from '../worker/worker';
import type { Request as CfRequest } from '@cloudflare/workers-types';

const isJurisdiction = (
	jurisdictionOrLocationHint: JurisdictionOrLocationHint
): jurisdictionOrLocationHint is DurableObjectJurisdiction => {
	return ['eu', 'fedramp', 'fedramp-high'].includes(jurisdictionOrLocationHint);
};

const getStub = ({ event }: { event: WorkerRequestEvent }): DurableObjectStub<AnyDurableServer> | null => {
	const { name, id, location } = event.meta;
	if (!name || !id) return null;

	if (!location) {
		return event.env[name].getByName(id) as any;
	}
	if (isJurisdiction(location)) {
		try {
			const stub = event.env[name].jurisdiction(location).getByName(id) as any;
			return stub;
		} catch (error) {
			return event.env[name].getByName(id) as any;
		}
	}

	return event.env[name].getByName(name, {
		locationHint: location,
	}) as any;
};

export async function fetch(config: WorkerConfig, event: WorkerRequestEvent) {
	const stub = getStub({ event });
	let response: Response | undefined;
	let error: FLARERROR | unknown | undefined;
	$: try {
		for (let handler of config.before || [] || []) {
			response = (await handler({ event })) ?? response;
			if (response) break $;
		}

		if (stub) {
			response = await stub.fetch(event.request as any, {
				cf: {
					...event.request.cf,
					meta: event.meta,
				},
			});
			if (event.meta.isWebSocketConnect) {
				return response;
			}
		} else {
			response = await handleRequest({ event, config });
		}
	} catch (err: FLARERROR | unknown) {
		error = err;
		response = handleError(error);
		config.onError?.forEach((handler) => handler({ error, event }));
	}

	for (let handler of config.after || []) {
		response = (await handler({ response, event, error })) ?? response;
	}

	return withCookies(response!, event);
}
