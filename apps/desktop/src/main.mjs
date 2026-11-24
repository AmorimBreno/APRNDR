// Processo principal da janela própria do app (Electron). Só abre uma janela
// que carrega o front (http://localhost:7430, servido pelo `pnpm dev`); o
// servidor e o Vite continuam sendo subidos pelo lançador (launcher/iniciar.mjs).
//
// Fechar a janela principal não encerra o Electron: ele fica na bandeja do Windows, com a bolinha
// do professor (flutuante.mjs). Quem encerra tudo é o "Sair do app" (bandeja ou tela de perfis) ou
// o "Parar Estudos". Com --bandeja (iniciar com o Windows), não abre a janela principal.
//
// Variáveis de ambiente opcionais (para testes):
//   ESTUDOS_URL=...        outro endereço do front (padrão http://localhost:7430);
//   ESTUDOS_CAPTURA=ARQ    grava um PNG da janela depois de carregar e encerra.

import { spawn } from "node:child_process";
import { app, BrowserWindow, ipcMain, Menu, screen, session, shell } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { iniciarFlutuante } from "./flutuante.mjs";
import { ARGUMENTO_BANDEJA } from "./estado-flutuante.mjs";
import { ajustarAsTelas, ALTURA_MINIMA, LARGURA_MINIMA, lerEstado } from "./estado-janela.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const URL_APP = process.env.ESTUDOS_URL ?? "http://localhost:7430";
const ORIGEM_APP = new URL(URL_APP).origin;
const RAIZ = join(AQUI, "..", "..", "..");

/** Mesma pasta local do servidor e do lançador (fora da pasta de dados e do Drive). */
const PASTA_APP = join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "estudos-app");
const ARQUIVO_JANELA = join(PASTA_APP, "janela.json");

/** Cores e altura da barra de título (design-system/tokens.css: --surface-ground e --ink). */
const COR_FUNDO = "#0f0e0d";
const COR_SIMBOLOS = "#e9e4db";
const ALTURA_BARRA = 32;

/** A identidade do app no Windows: a janela e o atalho do Menu Iniciar usam a mesma. */
const ID_DO_APP = "br.estudos-ia.aprndr";
const ARQUIVO_ICONE = join(AQUI, "..", "assets", "icone.ico");

app.setName("APRNDR");
// Windows: identidade própria na barra de tarefas (o agrupamento deixa de ser o do Electron).
app.setAppUserModelId(ID_DO_APP);
// O perfil do Chromium (localStorage, cache) fica junto do resto dos dados locais do app.
app.setPath("userData", join(PASTA_APP, "electron"));

if (!app.requestSingleInstanceLock()) {
	// Já tem uma janela aberta: ela recebe o "second-instance" e vem para a frente, sem recarregar.
	app.quit();
} else {
	app.on("second-instance", (_evento, argv) => {
		// Um --bandeja com o app já no ar não faz nada; o resto mostra a janela principal (sem mexer na bolinha).
		if (argv.includes(ARGUMENTO_BANDEJA)) return;
		mostrarPrincipal();
	});
	ipcMain.handle("estudos:sair", (evento) => {
		// Só a página do próprio app pode pedir (não uma página aberta por engano na janela).
		let origem;
		try {
			origem = new URL(evento.senderFrame?.url ?? "").origin;
		} catch {
			return;
		}
		if (origem === ORIGEM_APP) sairDoApp();
	});
	app.whenReady().then(() => {
		garantirAtalhoDoMenuIniciar();
		Menu.setApplicationMenu(null);
		protegerSessao();
		// Na captura de teste (ESTUDOS_CAPTURA) nada de bolinha, bandeja, atalhos globais nem atalho de inicialização.
		if (!process.env.ESTUDOS_CAPTURA) {
			iniciarFlutuante({
				urlApp: URL_APP,
				origemApp: ORIGEM_APP,
				pastaApp: PASTA_APP,
				raiz: RAIZ,
				preload: join(AQUI, "preload.cjs"),
				icone: ARQUIVO_ICONE,
				prenderNavegacao,
				atalhosDeTeclado: atalhos,
				mostrarPrincipal,
				sairDoApp,
			});
		}
		if (!process.argv.includes(ARGUMENTO_BANDEJA) || process.env.ESTUDOS_CAPTURA) abrirJanela();
	});
	// Sem janela aberta o Electron continua vivo na bandeja; só o "Sair do app" encerra.
	app.on("window-all-closed", () => {});
}

function lerEstadoSalvo() {
	let texto;
	try {
		texto = readFileSync(ARQUIVO_JANELA, "utf8");
	} catch {
		// Primeira abertura: sem arquivo.
	}
	return ajustarAsTelas(
		lerEstado(texto),
		screen.getAllDisplays().map((tela) => tela.workArea),
	);
}

/** Guarda o tamanho e a posição "normais" (não os da janela maximizada) para a próxima abertura. */
function guardarEstado(janela) {
	if (janela.isDestroyed() || janela.isMinimized() || janela.isFullScreen()) return;
	const { x, y, width, height } = janela.getNormalBounds();
	try {
		mkdirSync(PASTA_APP, { recursive: true });
		writeFileSync(ARQUIVO_JANELA, JSON.stringify({ x, y, width, height, maximizada: janela.isMaximized() }, null, 2) + "\n");
	} catch (erro) {
		console.warn("não consegui guardar o estado da janela:", erro);
	}
}

/**
 * O atalho "APRNDR" do Menu Iniciar, com a identidade do app (AppUserModelID). Sem um atalho com a
 * mesma identidade, fixar a janela na barra de tarefas cria um item que aponta para o electron.exe
 * solto (ícone do Electron, e abre o Electron vazio). Com ele, o item fixado é este atalho: abre o
 * app pelo lançador e mostra o ícone do professor. Só reescreve se faltar ou estiver diferente.
 */
function garantirAtalhoDoMenuIniciar() {
	if (process.platform !== "win32") return;
	try {
		const arquivo = join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs", "APRNDR.lnk");
		const desejado = {
			target: join(process.env.SystemRoot ?? "C:\Windows", "System32", "wscript.exe"),
			args: `"${join(RAIZ, "launcher", "iniciar.vbs")}"`,
			cwd: RAIZ,
			description: "Abre o APRNDR (sobe o servidor se preciso)",
			icon: ARQUIVO_ICONE,
			iconIndex: 0,
			appUserModelId: ID_DO_APP,
		};
		let atual;
		try {
			atual = shell.readShortcutLink(arquivo);
		} catch {
			// Não existe ainda.
		}
		const igual = atual && Object.entries(desejado).every(([chave, valor]) => String(atual[chave] ?? "").toLowerCase() === String(valor).toLowerCase());
		if (!igual) shell.writeShortcutLink(arquivo, "create", desejado);
	} catch (erro) {
		console.warn("não consegui garantir o atalho do Menu Iniciar:", erro);
	}
}

/**
 * "Sair do app" (o botão da tela de perfis): fecha a janela e encerra o servidor, o mesmo que o
 * launcher/parar.mjs faz. O parar roda separado e solto, porque este processo vai sair junto com a
 * janela; o próprio electron.exe, com ELECTRON_RUN_AS_NODE, serve de Node para ele (não depende do
 * node estar no PATH).
 */
function sairDoApp() {
	spawn(process.execPath, [join(RAIZ, "launcher", "parar.mjs")], {
		detached: true,
		stdio: "ignore",
		windowsHide: true,
		env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
	}).unref();
	app.quit();
}

/** O front responde? (o Vite pode estar reiniciando) */
async function frenteNoAr() {
	try {
		const resposta = await fetch(`${URL_APP}/`, { signal: AbortSignal.timeout(2000) });
		return resposta.ok;
	} catch {
		return false;
	}
}

/** A janela principal, se estiver aberta. */
/** @type {import("electron").BrowserWindow | null} */
let janelaPrincipal = null;

/** Mostra a janela principal (recriando se foi fechada) e a põe na frente. */
function mostrarPrincipal() {
	if (!janelaPrincipal || janelaPrincipal.isDestroyed()) {
		abrirJanela();
		return;
	}
	if (janelaPrincipal.isMinimized()) janelaPrincipal.restore();
	janelaPrincipal.show();
	janelaPrincipal.focus();
}

function abrirJanela() {
	const estado = lerEstadoSalvo();
	const janela = new BrowserWindow({
		...(estado.x !== undefined && estado.y !== undefined ? { x: estado.x, y: estado.y } : {}),
		width: estado.width,
		height: estado.height,
		minWidth: LARGURA_MINIMA,
		minHeight: ALTURA_MINIMA,
		// Só aparece quando a página está pronta, já na cor certa: sem piscar em branco.
		show: false,
		backgroundColor: COR_FUNDO,
		title: "APRNDR",
		icon: ARQUIVO_ICONE,
		// Sem a moldura do sistema: a barra é do app (BarraDoApp no front) e o Windows
		// desenha só os botões de minimizar, maximizar e fechar por cima dela.
		titleBarStyle: "hidden",
		titleBarOverlay: { color: COR_FUNDO, symbolColor: COR_SIMBOLOS, height: ALTURA_BARRA },
		webPreferences: {
			preload: join(AQUI, "preload.cjs"),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			spellcheck: false,
			additionalArguments: [`--estudos-altura-barra=${ALTURA_BARRA}`],
		},
	});

	janelaPrincipal = janela;
	janela.on("closed", () => {
		if (janelaPrincipal === janela) janelaPrincipal = null;
	});
	janela.once("ready-to-show", () => {
		if (estado.maximizada) janela.maximize();
		janela.show();
	});

	let adiar;
	const guardarDepois = () => {
		clearTimeout(adiar);
		adiar = setTimeout(() => guardarEstado(janela), 400);
	};
	janela.on("resize", guardarDepois);
	janela.on("move", guardarDepois);
	janela.on("maximize", guardarDepois);
	janela.on("unmaximize", guardarDepois);
	janela.on("close", () => guardarEstado(janela));

	prenderNavegacao(janela);
	atalhos(janela);
	carregar(janela);
	if (process.env.ESTUDOS_CAPTURA) capturar(janela, process.env.ESTUDOS_CAPTURA);
}

/** Carrega o front; se ele não responder, mostra a tela de reconexão e tenta de novo até ele voltar. */
function carregar(janela) {
	let reconectando = false;
	janela.webContents.on("did-fail-load", (_evento, codigo, _descricao, urlFalhou, principal) => {
		// -3 é uma navegação que foi trocada por outra; não é falha.
		if (!principal || codigo === -3 || reconectando || !urlFalhou.startsWith(URL_APP)) return;
		reconectando = true;
		void janela.loadFile(join(AQUI, "reconectando.html"));
		const tentar = async () => {
			if (janela.isDestroyed()) return;
			if (await frenteNoAr()) {
				reconectando = false;
				void janela.loadURL(URL_APP);
			} else {
				setTimeout(tentar, 1000);
			}
		};
		setTimeout(tentar, 1000);
	});
	void janela.loadURL(URL_APP);
}

/** A janela só navega no front do app; qualquer outro endereço http(s) abre no navegador padrão. */
function prenderNavegacao(janela) {
	const abrirFora = (url) => {
		try {
			const { protocol } = new URL(url);
			if (protocol === "http:" || protocol === "https:") void shell.openExternal(url);
		} catch {
			// URL inválida: ignora.
		}
	};
	janela.webContents.setWindowOpenHandler(({ url }) => {
		abrirFora(url);
		return { action: "deny" };
	});
	janela.webContents.on("will-navigate", (evento, url) => {
		if (url.startsWith("file://")) return; // a tela de reconexão
		if (new URL(url).origin === ORIGEM_APP) return;
		evento.preventDefault();
		abrirFora(url);
	});
}

/**
 * Sem permissões extras (câmera, localização...). Liberadas, só para o front do app (ORIGEM_APP):
 * escrever na área de transferência ("Copiar imagem" dos diagramas da conversa, para colar no
 * Samsung Notes) e o microfone, só áudio (a voz do professor flutuante). Ler a área de
 * transferência continua negado.
 */
const PERMISSOES_DO_APP = new Set(["clipboard-sanitized-write"]);

/** O microfone ("media") só para o front do app e só áudio (a voz do professor flutuante); câmera continua negada. */
function soAudio(permissao, tipos) {
	return permissao === "media" && Array.isArray(tipos) && tipos.length > 0 && tipos.every((tipo) => tipo === "audio");
}

function origemDe(url) {
	try {
		return new URL(url).origin;
	} catch {
		return "";
	}
}

function protegerSessao() {
	session.defaultSession.setPermissionRequestHandler((contents, permissao, resposta, detalhes) =>
		resposta(
			(PERMISSOES_DO_APP.has(permissao) || soAudio(permissao, /** @type {any} */ (detalhes)?.mediaTypes)) &&
				origemDe(detalhes?.requestingUrl ?? contents?.getURL() ?? "") === ORIGEM_APP,
		),
	);
	session.defaultSession.setPermissionCheckHandler(
		(_contents, permissao, origem, detalhes) =>
			(PERMISSOES_DO_APP.has(permissao) || soAudio(permissao, detalhes?.mediaType ? [detalhes.mediaType] : undefined)) && origemDe(origem) === ORIGEM_APP,
	);
}

/** Sem o menu padrão, os atalhos de navegador que o Breno usa precisam ser ligados à mão. */
function atalhos(janela) {
	const web = janela.webContents;
	web.on("before-input-event", (evento, entrada) => {
		if (entrada.type !== "keyDown") return;
		const ctrl = entrada.control || entrada.meta;
		const tecla = entrada.key.toLowerCase();
		if (tecla === "f12" || (ctrl && entrada.shift && tecla === "i")) {
			web.toggleDevTools();
		} else if (tecla === "f5" || (ctrl && tecla === "r")) {
			if (entrada.shift) web.reloadIgnoringCache();
			else web.reload();
		} else if (ctrl && (tecla === "=" || tecla === "+")) {
			web.setZoomLevel(web.getZoomLevel() + 0.5);
		} else if (ctrl && tecla === "-") {
			web.setZoomLevel(web.getZoomLevel() - 0.5);
		} else if (ctrl && tecla === "0") {
			web.setZoomLevel(0);
		} else {
			return;
		}
		evento.preventDefault();
	});
}

/** Para conferir a tela sem olhar: espera a página assentar, grava o PNG e encerra. */
function capturar(janela, arquivo) {
	janela.webContents.once("did-finish-load", () => {
		setTimeout(async () => {
			try {
				const imagem = await janela.webContents.capturePage();
				mkdirSync(dirname(arquivo), { recursive: true });
				writeFileSync(arquivo, imagem.toPNG());
				console.log(`captura gravada em ${arquivo} (${imagem.getSize().width}x${imagem.getSize().height})`);
			} catch (erro) {
				console.error("captura falhou:", erro);
			}
			app.quit();
		}, 2500);
	});
}
