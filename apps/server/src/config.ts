// Constantes do servidor, num lugar só.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Porta do servidor. O Vite (apps/web, porta 7430) repassa /api e /ws para cá. */
export const PORTA_SERVIDOR = 7431;

/** Raiz do repositório: apps/server/src -> três pastas acima. */
export const RAIZ_REPOSITORIO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const PASTA_PERFIS = join(RAIZ_REPOSITORIO, "profiles");
