// Ordem dos estilos (design-system/README.md): tokens, componentes, as peças
// comuns do @estudos/ui e, por último, os do app.
import "@estudos/design-system/tokens.css";
import "@estudos/design-system/componentes.css";
import "@estudos/ui/estilo.css";
import "./estilo.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

createRoot(document.getElementById("raiz")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
