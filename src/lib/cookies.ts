import { type SerializeOptions, serialize } from 'cookie';
import type { Request } from '@cloudflare/workers-types';

export class Cookies {
	requestCookies: Map<string, string> = new Map();
	responseCookies: Map<string, { value: string; options?: SerializeOptions }> = new Map();

	constructor(private request: Request) {}

	private createRequestCookies(): void {
		const cookieHeader = this.request.headers.get('Cookie');

		if (cookieHeader) {
			let index = 0;
			while (index < cookieHeader.length) {
				const eqIdx = cookieHeader.indexOf('=', index);
				if (eqIdx === -1) break;

				let endIdx = cookieHeader.indexOf(';', index);
				if (endIdx === -1) {
					endIdx = cookieHeader.length;
				} else if (endIdx < eqIdx) {
					index = cookieHeader.lastIndexOf(';', eqIdx - 1) + 1;
					continue;
				}

				const key = cookieHeader.slice(index, eqIdx).trim();
				if (!this.requestCookies.has(key)) {
					let val = cookieHeader.slice(eqIdx + 1, endIdx).trim();
					if (val.charCodeAt(0) === 0x22) {
						val = val.slice(1, -1);
					}
					this.requestCookies.set(key, decodeURIComponent(val));
				}

				index = endIdx + 1;
			}
		}
	}

	get(name: string): string | undefined {
		if (this.requestCookies.size === 0) {
			this.createRequestCookies();
		}
		return this.requestCookies.get(name);
	}

	set(name: string, value: string, options?: SerializeOptions): void {
		this.responseCookies.set(name, { value, options });
	}

	delete(name: string, options?: SerializeOptions): void {
		this.responseCookies.set(name, {
			value: '',
			options: { ...options, expires: new Date(0) },
		});
	}

	cookiefy(response: Response): Response {
		if (this.responseCookies.size > 0) {
			Array.from(this.responseCookies.entries()).forEach(([name, { value, options }]) => {
				response.headers.append('Set-Cookie', serialize(name, value, options));
			});
		}
		return response;
	}
}

export const withCookies = (reponse: Response, { cookies }: { cookies: Cookies }) => {
	if (reponse.status !== 200) {
		return reponse;
	}
	return cookies.cookiefy(reponse);
};
