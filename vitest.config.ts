import { defineConfig } from "vitest/config";

// Os testes ficam junto do código, em src/, em qualquer pacote ou app.
export default defineConfig({
	test: {
		include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
	},
});
