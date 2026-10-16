// Ordem dos estilos (design-system/README.md): tokens, componentes, depois os do app.
import "@estudos/design-system/tokens.css";
import "@estudos/design-system/componentes.css";
import "./estilo.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

createRoot(document.getElementById("raiz")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
