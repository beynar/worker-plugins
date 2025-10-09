import { tryParse } from '../utils';

export const handleStream = async (res: Response, callbackFunction: (chunk: any) => void) => {
	const reader = res.body!.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let first = true;
	const callback = (chunk: string, done: boolean) => {
		if (done) {
			return;
		}
		const lines = (buffer + chunk).split('\n');
		buffer = lines.pop()!;
		lines.forEach((line, i) => {
			if (first && i === 0 && line === '') {
				return;
			}
			(callbackFunction as any)({
				chunk: tryParse(line),
				first,
			});
			first = false;
		});
	};
	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		callback(decoder.decode(value), done);
	}
};
