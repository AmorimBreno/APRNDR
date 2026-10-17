import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

// Os testes ficam junto do código, em src/, em qualquer pacote ou app, e junto
// das extensões dos perfis (profiles/<id>/extensions/*.test.ts).
//
// As extensões dos perfis não têm node_modules: quem resolve o "typebox" delas
// é o pi, que carrega a extensão com um alias para a cópia dele. Nos testes, o
// alias aponta para a mesma versão, a do packages/core.
const doNucleo = createRequire(new URL("./packages/core/package.json", import.meta.url));

export default defineConfig({
	resolve: {
		alias: { typebox: doNucleo.resolve("typebox") },
	},
	test: {
		include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts", "profiles/*/extensions/*.test.ts", "profiles/*/lib/*.test.ts"],
	},
});
