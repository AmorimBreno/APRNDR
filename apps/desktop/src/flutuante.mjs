// O professor flutuante: a janela da bolinha (que vira o chat compacto), os atalhos globais, a
// bandeja do Windows e o atalho de "Iniciar com o Windows". As contas puras ficam em
// estado-flutuante.mjs (com testes); aqui é só o que mexe em janelas, disco e no sistema.
//
// FOCO (o Breno escreve com a S Pen no Samsung Notes, e a bolinha não pode atrapalhar):
// - no modo bolinha a janela é focusable: false e só aparece com showInactive(): nunca rouba o
//   foco, nem ao aparecer, nem ao mudar de estado, nem ao ser arrastada (mover nunca foca);
// - ao expandir para o chat ela passa a aceitar foco (setFocusable(true) + focus()), porque é
//   preciso digitar nela; ao recolher, volta a não aceitar (e tira o foco dela, para o Windows
//   devolver a ativação à janela de baixo). O Electron não diz qual era a janela ativa de outros
//   apps, então a devolução fica por conta do próprio Windows.
//
// NÍVEL DO alwaysOnTop: setAlwaysOnTop(true, "floating"). No Windows o Electron põe a janela como
// HWND_TOPMOST, que cobre os apps normais (inclusive o Samsung Notes, maximizado ou não). O nível
// "screen-saver" só valeria para apps em tela cheia exclusiva; se algum dia a bolinha sumir atrás
// de um, troque o NIVEL_POR_CIMA abaixo.

import { desktopCapturer, globalShortcut, ipcMain, Menu, nativeImage, screen, shell, Tray, BrowserWindow, app } from "electron";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	atalhoDeInicializacao,
	corrigirPosicao,
	gravarFlutuante,
	lerFlutuante,
	limitarNaArea,
	NOME_ATALHO_INICIALIZACAO,
	pastaInicializar,
	posicaoDoChat,
	tamanhoDaCaptura,
	TAMANHO_BOLINHA,
	TAMANHO_CHAT,
} from "./estado-flutuante.mjs";

const NIVEL_POR_CIMA = "floating";
const ESPERA_ESCONDER_MS = 200;
const ROTA_FLUTUANTE = "/#/flutuante/estudos";

/** @type {ReturnType<typeof criarContexto>} */
let ctx;
/** O Tray precisa de uma referência viva, ou o coletor de lixo o apaga da bandeja. */
let bandeja;
/** @type {import("electron").BrowserWindow | null} */
let janela = null;
let modo = "bolinha";
/** @type {import("./estado-flutuante.mjs").EstadoFlutuante} */
let estado = { ligada: true, inicioComWindowsEscolhido: false };
/** Posição da bolinha (canto de cima à esquerda, pixels da tela); o chat é calculado a partir dela. */
let posicao = { x: 0, y: 0 };
let adiarGravar;

/**
 * @param {{
 *   urlApp: string, origemApp: string, pastaApp: string, raiz: string, preload: string, icone: string,
 *   prenderNavegacao: (janela: import("electron").BrowserWindow) => void,
 *   atalhosDeTeclado: (janela: import("electron").BrowserWindow) => void,
 *   mostrarPrincipal: () => void,
 *   sairDoApp: () => void,
 * }} dados
 */
function criarContexto(dados) {
	return { ...dados, arquivo: join(dados.pastaApp, "flutuante.json") };
}

/** Chamado uma vez, com o app pronto (a decisão de abrir ou não a janela principal é do main.mjs). */
export function iniciarFlutuante(dados) {
	ctx = criarContexto(dados);
	lerEstado();
	garantirInicioComWindows();
	registrarIpc();
	criarBandeja();
	registrarAtalhosGlobais();
	if (estado.ligada) mostrarBolinha();
	screen.on("display-removed", reposicionar);
	screen.on("display-metrics-changed", reposicionar);
	app.on("will-quit", () => globalShortcut.unregisterAll());
}

/** Há como o Breno voltar ao app sem janela principal (o ícone da bandeja ou a bolinha à vista)? */
export function temPresenca() {
	return !!bandeja || !!vivaOuNula()?.isVisible();
}

// --- estado em disco ------------------------------------------------------

function areas() {
	const principal = screen.getPrimaryDisplay();
	const outras = screen.getAllDisplays().filter((tela) => tela.id !== principal.id);
	return [principal, ...outras].map((tela) => tela.workArea);
}

function lerEstado() {
	let texto;
	try {
		texto = readFileSync(ctx.arquivo, "utf8");
	} catch {
		// Primeira vez: sem arquivo.
	}
	estado = lerFlutuante(texto);
	posicao = corrigirPosicao(estado, areas());
}

function gravarEstado() {
	clearTimeout(adiarGravar);
	try {
		mkdirSync(dirname(ctx.arquivo), { recursive: true });
		writeFileSync(ctx.arquivo, gravarFlutuante({ ...estado, x: posicao.x, y: posicao.y }));
	} catch (erro) {
		console.warn("não consegui guardar o flutuante.json:", erro);
	}
}

function gravarDepois() {
	clearTimeout(adiarGravar);
	adiarGravar = setTimeout(gravarEstado, 400);
}

// --- a janela da bolinha --------------------------------------------------

function boundsBolinha() {
	return { ...posicao, ...TAMANHO_BOLINHA };
}

function vivaOuNula() {
	return janela && !janela.isDestroyed() ? janela : null;
}

function criarJanela() {
	const nova = new BrowserWindow({
		...boundsBolinha(),
		frame: false,
		transparent: true,
		backgroundColor: "#00000000",
		alwaysOnTop: true,
		skipTaskbar: true,
		resizable: false,
		maximizable: false,
		minimizable: false,
		fullscreenable: false,
		hasShadow: false,
		// Nunca aceita foco enquanto é bolinha: escrever com a caneta no Samsung Notes não é interrompido.
		focusable: false,
		show: false,
		title: "APRNDR · professor",
		icon: ctx.icone,
		webPreferences: {
			preload: ctx.preload,
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			spellcheck: false,
			additionalArguments: ["--estudos-janela=flutuante"],
		},
	});
	nova.setAlwaysOnTop(true, NIVEL_POR_CIMA);
	ctx.prenderNavegacao(nova);
	ctx.atalhosDeTeclado(nova);
	modo = "bolinha";

	// Se o front estiver fora do ar (o Vite reiniciando), tenta de novo em vez de ficar uma bolinha em branco.
	nova.webContents.on("did-fail-load", (_evento, codigo, _descricao, urlFalhou, principal) => {
		if (!principal || codigo === -3 || !urlFalhou.startsWith(ctx.urlApp)) return;
		setTimeout(() => {
			if (!nova.isDestroyed()) void nova.loadURL(ctx.urlApp + ROTA_FLUTUANTE);
		}, 1500);
	});
	nova.once("ready-to-show", () => {
		if (!nova.isDestroyed() && estado.ligada && modo === "bolinha") nova.showInactive();
	});
	nova.on("closed", () => {
		if (janela === nova) janela = null;
	});
	void nova.loadURL(ctx.urlApp + ROTA_FLUTUANTE);
	return nova;
}

/** Liga: cria a janela se preciso e mostra sem pegar o foco. */
function mostrarBolinha() {
	let atual = vivaOuNula();
	if (!atual) {
		janela = atual = criarJanela();
		return; // o ready-to-show mostra
	}
	if (!atual.isVisible()) atual.showInactive();
}

function esconderBolinha() {
	const atual = vivaOuNula();
	if (!atual) return;
	if (modo === "chat") recolher();
	atual.hide();
}

function ligar(ligada) {
	estado.ligada = ligada;
	gravarEstado();
	if (ligada) mostrarBolinha();
	else esconderBolinha();
	atualizarBandeja();
}

function avisarModo() {
	const atual = vivaOuNula();
	if (atual && !atual.webContents.isDestroyed()) atual.webContents.send("estudos:flutuante:modo-mudou", modo);
}

function areaDaBolinha() {
	return screen.getDisplayMatching(boundsBolinha()).workArea;
}

function expandir() {
	const atual = vivaOuNula();
	if (!atual || modo === "chat") return;
	const canto = posicaoDoChat(posicao, areaDaBolinha());
	modo = "chat";
	atual.setHasShadow(true);
	atual.setFocusable(true);
	atual.setBounds({ ...canto, ...TAMANHO_CHAT });
	if (!atual.isVisible()) atual.showInactive();
	atual.focus();
	avisarModo();
}

function recolher() {
	const atual = vivaOuNula();
	if (!atual || modo === "bolinha") return;
	modo = "bolinha";
	atual.setBounds(boundsBolinha());
	atual.setHasShadow(false);
	atual.setFocusable(false);
	// Devolve o foco ao app em que o Breno estava (o Samsung Notes): esconder a janela ativa faz o Windows ativar a
	// janela anterior; depois ela volta como bolinha, sem foco. (O blur() ativava a próxima na ordem Z, que podia ser
	// a janela principal do APRNDR; achado do code-review.)
	atual.hide();
	atual.showInactive();
	avisarModo();
}

function reposicionar() {
	posicao = corrigirPosicao(posicao, areas());
	const atual = vivaOuNula();
	if (atual && modo === "bolinha") atual.setBounds(boundsBolinha());
}

function alternarChat() {
	if (!estado.ligada) {
		estado.ligada = true;
		gravarEstado();
		mostrarBolinha();
		atualizarBandeja();
		// A janela pode estar nascendo: expande quando ela estiver pronta.
		const atual = vivaOuNula();
		if (atual?.webContents.isLoading()) atual.webContents.once("did-finish-load", expandir);
		else expandir();
		return;
	}
	if (modo === "chat") recolher();
	else expandir();
}

function alternarVoz() {
	if (!estado.ligada) {
		estado.ligada = true;
		gravarEstado();
		mostrarBolinha();
		atualizarBandeja();
	}
	const atual = vivaOuNula();
	if (!atual) return;
	const mandar = () => {
		if (!atual.isDestroyed()) atual.webContents.send("estudos:flutuante:alternar-voz");
	};
	if (modo === "bolinha") expandir();
	if (atual.webContents.isLoading()) atual.webContents.once("did-finish-load", mandar);
	else mandar();
}

/** Esconde a bolinha, captura a tela dela e mostra de novo, sem nunca pegar o foco. */
async function capturarTela() {
	const atual = vivaOuNula();
	if (!atual) return null;
	const estavaVisivel = atual.isVisible();
	const tela = screen.getDisplayMatching(atual.getBounds());
	const fisico = { width: Math.round(tela.size.width * tela.scaleFactor), height: Math.round(tela.size.height * tela.scaleFactor) };
	try {
		if (estavaVisivel) atual.hide();
		await new Promise((r) => setTimeout(r, ESPERA_ESCONDER_MS));
		const fontes = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: tamanhoDaCaptura(fisico.width, fisico.height) });
		const indice = screen.getAllDisplays().findIndex((t) => t.id === tela.id);
		const fonte = fontes.find((f) => f.display_id === String(tela.id)) ?? fontes[indice] ?? fontes[0];
		if (!fonte || fonte.thumbnail.isEmpty()) return null;
		const { width, height } = fonte.thumbnail.getSize();
		return { tipo: "image/jpeg", dados: fonte.thumbnail.toJPEG(85).toString("base64"), largura: width, altura: height };
	} catch (erro) {
		console.warn("a captura da tela falhou:", erro);
		return null;
	} finally {
		const de_novo = vivaOuNula();
		if (de_novo && estavaVisivel) {
			de_novo.showInactive();
			if (modo === "chat") de_novo.focus();
		}
	}
}

// --- IPC ------------------------------------------------------------------

function origemDe(url) {
	try {
		return new URL(url).origin;
	} catch {
		return "";
	}
}

/** Só a página do próprio app (não uma página aberta por engano numa janela). */
function doApp(evento) {
	return origemDe(evento.senderFrame?.url ?? "") === ctx.origemApp;
}

/** Só a página da própria bolinha. */
function daBolinha(evento) {
	const atual = vivaOuNula();
	return doApp(evento) && !!atual && evento.sender === atual.webContents;
}

function registrarIpc() {
	ipcMain.handle("estudos:flutuante:modo", (evento) => (daBolinha(evento) ? modo : "bolinha"));
	ipcMain.handle("estudos:flutuante:expandir", (evento) => {
		if (daBolinha(evento)) expandir();
	});
	ipcMain.handle("estudos:flutuante:recolher", (evento) => {
		if (daBolinha(evento)) recolher();
	});
	// Arrastar a bolinha: nunca foca. No chat não há o que arrastar.
	ipcMain.on("estudos:flutuante:mover", (evento, x, y) => {
		if (!daBolinha(evento) || modo !== "bolinha" || typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return;
		const atual = vivaOuNula();
		if (!atual) return;
		const centro = { x: Math.round(x) + TAMANHO_BOLINHA.width / 2, y: Math.round(y) + TAMANHO_BOLINHA.height / 2 };
		const area = screen.getDisplayNearestPoint(centro).workArea;
		posicao = limitarNaArea(x, y, TAMANHO_BOLINHA, area);
		atual.setBounds(boundsBolinha());
		gravarDepois();
	});
	ipcMain.handle("estudos:flutuante:capturar", (evento) => (daBolinha(evento) ? capturarTela() : null));
	ipcMain.handle("estudos:flutuante:abrir-app", (evento) => {
		if (daBolinha(evento)) ctx.mostrarPrincipal();
	});
	ipcMain.handle("estudos:flutuante:esconder", (evento) => {
		if (daBolinha(evento)) ligar(false);
	});
	// O menu do clique direito na bolinha: nativo do Windows (a bolinha tem 76 px; um menu desenhado nela não cabe).
	ipcMain.handle("estudos:flutuante:menu", (evento) => {
		if (!daBolinha(evento)) return;
		const atual = janela;
		if (!atual || atual.isDestroyed()) return;
		Menu.buildFromTemplate([
			{ label: "Abrir o chat", click: () => expandir() },
			{ label: "Abrir o app", click: () => ctx.mostrarPrincipal() },
			{ type: "separator" },
			{ label: "Esconder o professor", click: () => ligar(false) },
		]).popup({ window: atual });
	});
	ipcMain.handle("estudos:bolinha:ligada", (evento) => (doApp(evento) ? estado.ligada : false));
	ipcMain.handle("estudos:bolinha:ligar", (evento, ligada) => {
		if (doApp(evento)) ligar(ligada === true);
	});
}

// --- atalhos globais ------------------------------------------------------

function registrarAtalhosGlobais() {
	/** @type {[string, () => void][]} */
	const lista = [
		["Control+Alt+P", alternarChat],
		["Control+Alt+Space", alternarVoz],
	];
	for (const [atalho, acao] of lista) {
		try {
			if (!globalShortcut.register(atalho, acao)) console.warn(`não consegui registrar o atalho ${atalho} (outro app já o usa)`);
		} catch (erro) {
			console.warn(`não consegui registrar o atalho ${atalho}:`, erro);
		}
	}
}

// --- bandeja --------------------------------------------------------------

function criarBandeja() {
	try {
		bandeja = new Tray(nativeImage.createFromPath(ctx.icone));
		bandeja.setToolTip("APRNDR · professor");
		bandeja.on("click", () => ligar(!(estado.ligada && vivaOuNula()?.isVisible())));
		atualizarBandeja();
	} catch (erro) {
		console.warn("não consegui criar o ícone da bandeja:", erro);
	}
}

function atualizarBandeja() {
	if (!bandeja) return;
	bandeja.setContextMenu(
		Menu.buildFromTemplate([
			{ label: estado.ligada ? "Esconder o professor" : "Mostrar o professor", click: () => ligar(!estado.ligada) },
			{ label: "Abrir o app", click: () => ctx.mostrarPrincipal() },
			{
				label: "Iniciar com o Windows",
				type: "checkbox",
				checked: inicioComWindowsLigado(),
				click: (item) => {
					definirInicioComWindows(item.checked);
					atualizarBandeja();
				},
			},
			{ type: "separator" },
			{ label: "Sair do app", click: () => ctx.sairDoApp() },
		]),
	);
}

// --- iniciar com o Windows ------------------------------------------------

function arquivoInicializacao() {
	return join(pastaInicializar(app.getPath("appData")), NOME_ATALHO_INICIALIZACAO);
}

function inicioComWindowsLigado() {
	return process.platform === "win32" && existsSync(arquivoInicializacao());
}

function definirInicioComWindows(ligado) {
	if (process.platform !== "win32") return;
	try {
		const arquivo = arquivoInicializacao();
		if (ligado) {
			mkdirSync(dirname(arquivo), { recursive: true });
			shell.writeShortcutLink(arquivo, "create", atalhoDeInicializacao({ raiz: ctx.raiz, pastaDoSistema: process.env.SystemRoot ?? "C:\\Windows", icone: ctx.icone }));
		} else if (existsSync(arquivo)) {
			unlinkSync(arquivo);
		}
	} catch (erro) {
		console.warn("não consegui mudar o atalho de inicialização:", erro);
	}
}

/** Na primeira vez liga o início com o Windows; depois respeita a escolha (não recria se o Breno desligou). */
function garantirInicioComWindows() {
	if (estado.inicioComWindowsEscolhido) return;
	definirInicioComWindows(true);
	estado.inicioComWindowsEscolhido = true;
	gravarEstado();
}
