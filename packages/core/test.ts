// type Router = Record<string, any>;

// abstract class DurableServer {
// 	abstract router: Router;
// 	constructor(public name: string) {}
// }

// // 🐘 The Elephant Solution: Self-referential generic pattern
// const createDurableServer = <RP extends Router>(plugins?: RP) => {
// 	abstract class Base<Self extends Base<Self>> extends DurableServer {
// 		plugins = plugins;

// 		// Use Self['router'] to reference the derived class's router type
// 		declare pluggedRouters: RP;
// 		declare routerKeys: keyof Self['router'];
// 		declare combinedRouter: Self['router'] & RP;

// 		constructor(public name: string) {
// 			super(name);
// 		}

// 		// Helper method that's properly typed
// 		getRouterKey(): keyof Self['router'] {
// 			return null as any;
// 		}
// 	}

// 	return Base;
// };

// // Now MyDurableServer properly infers its own router type!
// class MyDurableServer extends createDurableServer()<MyDurableServer> {
// 	router = {
// 		test2: 'test2',
// 		test3: 'test3',
// 	};

// 	constructor(name: string) {
// 		super(name);

// 		// ✅ All properly typed now!
// 		type T = typeof this.router;              // { test2: string; test3: string }
// 		type TT = typeof this.routerKeys;         // "test2" | "test3"
// 		type TTT = typeof this.plugins;           // { test: string }
// 		type Combined = typeof this.combinedRouter; // { test2: string; test3: string } & { test: string }

// 		// This works and is properly typed:
// 		const key = this.getRouterKey(); // "test2" | "test3"
// 	}
// }

// const derived = new MyDurableServer('test');

// // All properly typed!
// type RouterTest = typeof derived.router;          // { test2: string; test3: string }
// type PluggedTest = typeof derived.pluggedRouters; // { test: string }
// type CombinedTest = typeof derived.combinedRouter; // { test2: string; test3: string } & { test: string }

// // ========================================
// // 🎯 BEST DX APPROACH: Polymorphic 'this' type (as implemented in plugin.ts)
// // ========================================
// type MergedType<CustomRouter, PluginRouter> = CustomRouter & PluginRouter;

// interface API<T> {
// 	send: T;
// }

// class SimpleDurableServer {
// 	constructor(public plugins: any) {}
// }

// const createSimpleDurableServer = <P extends Router>(plugins: P) => {
// 	return class extends SimpleDurableServer {
// 		plugins = plugins;

// 		// 🎯 Polymorphic 'this' type automatically infers derived class's router!
// 		declare api: API<MergedType<this['router'], P>>;
// 	};
// };

// // ✨ Perfect DX - no declare needed, fully typed automatically!
// class MySimpleServer extends createSimpleDurableServer({ plugin1: 'test' }) {
// 	router = { custom1: 'value' };
// 	// api is automatically typed as API<{ custom1: string } & { plugin1: string }>
// }

// const simple = new MySimpleServer({ plugin1: 'test' });
// type SimpleApiType = typeof simple.api; // API<{ custom1: string } & { plugin1: string }>
// // ✅ simple.api.send.custom1 - autocomplete works!
// // ✅ simple.api.send.plugin1 - autocomplete works!
