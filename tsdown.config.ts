import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['./src/lib/index.ts'],
	outDir: './dist',
	format: 'esm',
	sourcemap: true,
	clean: true,
	dts: true,
	minify: true,
	tsconfig: './tsconfig.json',
	external: ['cloudflare:workers'],
	hooks: {
		'build:done'(ctx) {
			console.log(ctx);
		},
	},
});
