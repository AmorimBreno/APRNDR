// O professor flutuante: DUAS janelas, a da bolinha e a do balão do chat, os atalhos globais, a bandeja do Windows e
// o atalho de "Iniciar com o Windows". As contas puras ficam em estado-flutuante.mjs (com testes); aqui é só o que mexe
// em janelas, disco e no sistema.
//
// - A janela da BOLINHA tem 76 x 76 e nunca muda de tamanho: sempre focusable: false e só aparece com showInactive(). Nunca
//   rouba o foco, nem ao aparecer, nem ao mudar de estado, nem ao ser arrastada.
// - A janela do BALÃO é criada uma vez (escondida) e depois só mostrada e escondida, nunca destruída ao fechar: a conversa,
//   a rolagem, o rascunho, a captura pendente e a voz continuam no lugar. Ao abrir, aceita foco (é preciso digitar); ao
//   fechar, hide() faz o Windows devolver a ativação à janela de antes (o Samsung Notes). O Electron não diz qual era a
//   janela ativa de outros apps, então a devolução fica por conta do próprio Windows.
// - As duas andam juntas: o balão fica a um deslocamento fixo da bolinha (balão = bolinha + deslocamento), e arrastar uma
//   leva a outra. Sem setShape e sem esconder a janela durante a troca: a bolinha nunca muda de tamanho nem de lugar.
//
// NÍVEL DO alwaysOnTop: setAlwaysOnTop(true, "floating") nas duas. No Windows o Electron põe a janela como
// HWND_TOPMOST, que cobre os apps normais (inclusive o Samsung Notes, maximizado ou não). O nível
// "screen-saver" só valeria para apps em tela cheia exclusiva; se algum dia a bolinha sumir atrás
// de um, troque o NIVEL_POR_CIMA abaixo.

import { desktopCapturer, globalShortcut, ipcMain, Menu, nativeImage, screen, shell, systemPreferences, Tray, BrowserWindow, app } from "electron";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	atalhoDeInicializacao,
	balaoPelaBolinha,
	bolinhaPeloBalao,
	corrigirPosicao,
	deslocamentoDoBalao,
	disposicaoDoBalao,
	gravarFlutuante,
	lerFlutuante,
	limitarNaArea,
	NOME_ATALHO_INICIALIZACAO,
	pastaInicializar,
	tamanhoDaCaptura,
	TAMANHO_BOLINHA,
	TAMANHO_CHAT,
	VAO_BALAO,
} from "./estado-flutuante.mjs";

const NIVEL_POR_CIMA = "floating";
const ESPERA_ESCONDER_MS = 200;
const ROTA_FLUTUANTE = "/#/flutuante/estudos";
const ROTA_BALAO = "/#/flutuante/estudos/balao";
/** Depois de o Electron mexer numa janela, os "move" dela (que ele mesmo causou) não levam a outra de volta. */
const ESPERA_ECO_MS = 120;

/** @type {ReturnType<typeof criarContexto>} */
let ctx;
/** O Tray precisa de uma referência viva, ou o coletor de lixo o apaga da bandeja. */
let bandeja;
/** @type {import("electron").BrowserWindow | null} */
let janela = null;
/** @type {import("electron").BrowserWindow | null} */
let balao = null;
/** @type {import("./estado-flutuante.mjs").EstadoFlutuante} */
let estado = { ligada: true, inicioComWindowsEscolhido: false };
/** Posição da bolinha (canto de cima à esquerda, pixels da tela); o balão do chat é calculado a partir dela. */
let posicao = { x: 0, y: 0 };
/** A última disposição do balão (a página pede ao carregar); null até a primeira abertura. */
/** @type {import("./estado-flutuante.mjs").Disposicao | null} */
let disposicao = null;
/** Balão menos bolinha, na tela, enquanto o balão está aberto. */
/** @type {{ x: number, y: number } | null} */
let deslocamento = null;
/** Até quando os "move" do balão são ecos de um setBounds nosso. */
let ecoAte = 0;
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

// --- as janelas -----------------------------------------------------------

function boundsBolinha() {
	return { ...posicao, ...TAMANHO_BOLINHA };
}

function vivaOuNula() {
	return janela && !janela.isDestroyed() ? janela : null;
}

function balaoVivo() {
	return balao && !balao.isDestroyed() ? balao : null;
}

function balaoAberto() {
	return !!balaoVivo()?.isVisible();
}

/** As opções que as duas janelas têm em comum: transparentes, sem moldura, por cima, fora da barra de tarefas. */
function opcoesDaJanela(extra, argumento) {
	return {
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
		show: false,
		title: "APRNDR · professor",
		icon: ctx.icone,
		webPreferences: {
			preload: ctx.preload,
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			spellcheck: false,
			additionalArguments: [argumento],
		},
		...extra,
	};
}

/** Carrega a rota; se o front estiver fora do ar (o Vite reiniciando), tenta de novo em vez de ficar em branco. */
function carregar(nova, rota) {
	nova.webContents.on("did-fail-load", (_evento, codigo, _descricao, urlFalhou, principal) => {
		if (!principal || codigo === -3 || !urlFalhou.startsWith(ctx.urlApp)) return;
		setTimeout(() => {
			if (!nova.isDestroyed()) void nova.loadURL(ctx.urlApp + rota);
		}, 1500);
	});
	void nova.loadURL(ctx.urlApp + rota);
}

function criarJanela() {
	const nova = new BrowserWindow(
		opcoesDaJanela(
			{
				...boundsBolinha(),
				// Nunca aceita foco: escrever com a caneta no Samsung Notes não é interrompido.
				focusable: false,
			},
			"--estudos-janela=flutuante",
		),
	);
	nova.setAlwaysOnTop(true, NIVEL_POR_CIMA);
	ctx.prenderNavegacao(nova);
	ctx.atalhosDeTeclado(nova);
	nova.once("ready-to-show", () => {
		if (!nova.isDestroyed() && estado.ligada) nova.showInactive();
	});
	nova.on("closed", () => {
		if (janela === nova) janela = null;
	});
	carregar(nova, ROTA_FLUTUANTE);
	return nova;
}

/** A janela do balão: criada uma vez, escondida; abrir e fechar só mostram e escondem (a conversa e a voz continuam vivas). */
function criarBalao() {
	const nova = new BrowserWindow(opcoesDaJanela({ width: TAMANHO_CHAT.width + VAO_BALAO, height: TAMANHO_CHAT.height, focusable: true }, "--estudos-janela=balao"));
	nova.setAlwaysOnTop(true, NIVEL_POR_CIMA);
	ctx.prenderNavegacao(nova);
	ctx.atalhosDeTeclado(nova);
	// O balão arrastado pelo topo (arrasto nativo, "move" contínuo no Windows): a bolinha vai junto, no mesmo deslocamento.
	nova.on("move", () => {
		if (nova.isDestroyed() || Date.now() < ecoAte || !deslocamento || !disposicao || !nova.isVisible()) return;
		const { x, y } = nova.getBounds();
		posicao = bolinhaPeloBalao(deslocamento, { x, y });
		disposicao = { ...disposicao, balao: { ...disposicao.balao, x, y } };
		vivaOuNula()?.setBounds(boundsBolinha());
		gravarDepois();
	});
	// No fim do arrasto a bolinha é puxada para uma tela visível (se foi para fora) e a posição fica gravada.
	nova.on("moved", () => {
		if (nova.isDestroyed() || !deslocamento || !disposicao || !nova.isVisible()) return;
		const corrigida = corrigirPosicao(posicao, areas());
		if (corrigida.x !== posicao.x || corrigida.y !== posicao.y) {
			posicao = corrigida;
			vivaOuNula()?.setBounds(boundsBolinha());
			disposicao = { ...disposicao, balao: { ...disposicao.balao, ...balaoPelaBolinha(deslocamento, posicao) } };
			colocarBalao(disposicao.balao);
		}
		gravarDepois();
	});
	nova.on("closed", () => {
		if (balao === nova) balao = null;
	});
	carregar(nova, ROTA_BALAO);
	return nova;
}

/** Põe a janela do balão no retângulo, sem que o "move" que isso causa leve a bolinha de volta. */
function colocarBalao(retangulo) {
	const b = balaoVivo();
	if (!b) return;
	ecoAte = Date.now() + ESPERA_ECO_MS;
	b.setBounds(retangulo);
}

/** As duas janelas existem (escondidas, se acabaram de nascer). */
function garantirJanelas() {
	if (!vivaOuNula()) janela = criarJanela();
	if (!balaoVivo()) balao = criarBalao();
}

/** Liga: cria as janelas se preciso e mostra só a bolinha, sem pegar o foco. */
function mostrarBolinha() {
	garantirJanelas();
	const atual = vivaOuNula();
	// Uma janela que nasceu agora é mostrada pelo ready-to-show.
	if (atual && !atual.webContents.isLoading() && !atual.isVisible()) atual.showInactive();
}

function esconderTudo() {
	fecharBalao();
	vivaOuNula()?.hide();
}

function ligar(ligada) {
	estado.ligada = ligada;
	gravarEstado();
	if (ligada) mostrarBolinha();
	else esconderTudo();
	atualizarBandeja();
}

function areaDaBolinha() {
	return screen.getDisplayMatching(boundsBolinha()).workArea;
}

function avisarDisposicao() {
	const b = balaoVivo();
	if (b && !b.webContents.isDestroyed()) b.webContents.send("estudos:flutuante:disposicao-mudou", disposicao);
}

/** Abre o balão ao lado da bolinha (que não sai do lugar): calcula a disposição, avisa a página, mostra e põe o foco. */
function abrirBalao() {
	const b = balaoVivo();
	if (!b || !vivaOuNula()) return;
	disposicao = disposicaoDoBalao(posicao, areaDaBolinha());
	deslocamento = deslocamentoDoBalao(disposicao, posicao);
	colocarBalao(disposicao.balao);
	avisarDisposicao();
	surgir(b);
	b.focus();
}

/** O relógio do surgir do balão, para um abrir novo cancelar o anterior. */
/** @type {ReturnType<typeof setInterval> | undefined} */
let relogioSurgir;

/**
 * Mostra o balão já invisível e sobe a opacidade da janela em ~150 ms. Uma animação na página piscava: o Windows mostra
 * primeiro o último quadro pintado (o balão inteiro) e a animação recomeçava do zero (relato do Breno). Com movimento
 * reduzido no Windows, aparece direto.
 * @param {import("electron").BrowserWindow} b
 */
function surgir(b) {
	clearInterval(relogioSurgir);
	const reduzido = (() => {
		try {
			return systemPreferences.getAnimationSettings().prefersReducedMotion;
		} catch {
			return false;
		}
	})();
	if (reduzido) {
		b.setOpacity(1);
		b.show();
		return;
	}
	b.setOpacity(0);
	b.show();
	let opacidade = 0;
	relogioSurgir = setInterval(() => {
		opacidade = Math.min(1, opacidade + 0.12);
		if (!b.isDestroyed()) b.setOpacity(opacidade);
		if (opacidade >= 1 || b.isDestroyed()) clearInterval(relogioSurgir);
	}, 16);
}

/** Fecha o balão: só esconde (o Windows devolve a ativação à janela de antes). */
function fecharBalao() {
	const b = balaoVivo();
	if (b?.isVisible()) b.hide();
}

function alternarBalao() {
	if (balaoAberto()) fecharBalao();
	else abrirBalao();
}

function reposicionar() {
	posicao = corrigirPosicao(posicao, areas());
	vivaOuNula()?.setBounds(boundsBolinha());
	if (balaoAberto()) {
		// A tela mudou com o balão aberto: nova disposição para a bolinha corrigida.
		disposicao = disposicaoDoBalao(posicao, areaDaBolinha());
		deslocamento = deslocamentoDoBalao(disposicao, posicao);
		colocarBalao(disposicao.balao);
		avisarDisposicao();
	}
}

/** Liga a bolinha se estiver desligada (e grava), para um atalho global poder abrir o balão. */
function garantirLigada() {
	if (!estado.ligada) {
		estado.ligada = true;
		gravarEstado();
		atualizarBandeja();
	}
	mostrarBolinha();
}

function alternarChat() {
	garantirLigada();
	alternarBalao();
}

function alternarVoz() {
	garantirLigada();
	const b = balaoVivo();
	if (!b) return;
	if (!balaoAberto()) abrirBalao();
	const mandar = () => {
		if (!b.isDestroyed()) b.webContents.send("estudos:flutuante:alternar-voz");
	};
	if (b.webContents.isLoading()) b.webContents.once("did-finish-load", mandar);
	else mandar();
}

/** Esconde a bolinha e o balão, captura a tela dela e mostra de novo como estavam; a bolinha nunca pega o foco. */
async function capturarTela() {
	const atual = vivaOuNula();
	if (!atual) return null;
	const b = balaoVivo();
	const bolinhaVisivel = atual.isVisible();
	const balaoVisivel = !!b?.isVisible();
	const balaoTinhaFoco = !!b?.isFocused();
	const tela = screen.getDisplayMatching(atual.getBounds());
	const fisico = { width: Math.round(tela.size.width * tela.scaleFactor), height: Math.round(tela.size.height * tela.scaleFactor) };
	try {
		if (bolinhaVisivel) atual.hide();
		if (balaoVisivel) b?.hide();
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
		const bolinhaDeNovo = vivaOuNula();
		if (bolinhaDeNovo && bolinhaVisivel) bolinhaDeNovo.showInactive();
		const balaoDeNovo = balaoVivo();
		if (balaoDeNovo && balaoVisivel) {
			if (balaoTinhaFoco) {
				balaoDeNovo.show();
				balaoDeNovo.focus();
			} else {
				balaoDeNovo.showInactive();
			}
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

/** Só a página da janela da bolinha. */
function daBolinha(evento) {
	const atual = vivaOuNula();
	return doApp(evento) && !!atual && evento.sender === atual.webContents;
}

/** Só a página da janela do balão. */
function daBalao(evento) {
	const b = balaoVivo();
	return doApp(evento) && !!b && evento.sender === b.webContents;
}

function registrarIpc() {
	// --- a bolinha
	ipcMain.handle("estudos:flutuante:alternar-balao", (evento) => {
		if (daBolinha(evento)) alternarBalao();
	});
	// Arrastar a bolinha: nunca foca. (x, y) é a posição desejada da BOLINHA na tela; o balão aberto anda junto.
	ipcMain.handle("estudos:flutuante:mover", (evento, x, y) => {
		if (!daBolinha(evento) || typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return;
		const atual = vivaOuNula();
		if (!atual) return;
		const centro = { x: Math.round(x) + TAMANHO_BOLINHA.width / 2, y: Math.round(y) + TAMANHO_BOLINHA.height / 2 };
		const area = screen.getDisplayNearestPoint(centro).workArea;
		posicao = limitarNaArea(x, y, TAMANHO_BOLINHA, area);
		atual.setBounds(boundsBolinha());
		if (balaoAberto() && disposicao && deslocamento) {
			disposicao = { ...disposicao, balao: { ...disposicao.balao, ...balaoPelaBolinha(deslocamento, posicao) } };
			colocarBalao(disposicao.balao);
		}
		gravarDepois();
	});
	ipcMain.handle("estudos:flutuante:esconder", (evento) => {
		if (daBolinha(evento)) ligar(false);
	});
	// O menu do clique direito na bolinha: nativo do Windows (a bolinha tem 76 px; um menu desenhado nela não cabe).
	ipcMain.handle("estudos:flutuante:menu", (evento) => {
		if (!daBolinha(evento)) return;
		const atual = vivaOuNula();
		if (!atual) return;
		Menu.buildFromTemplate([
			{ label: balaoAberto() ? "Fechar o chat" : "Abrir o chat", click: () => alternarBalao() },
			{ label: "Abrir o app", click: () => ctx.mostrarPrincipal() },
			{ type: "separator" },
			{ label: "Esconder o professor", click: () => ligar(false) },
		]).popup({ window: atual });
	});

	// --- o balão
	ipcMain.handle("estudos:flutuante:disposicao", (evento) => (daBalao(evento) ? disposicao : null));
	ipcMain.handle("estudos:flutuante:fechar-balao", (evento) => {
		if (daBalao(evento)) fecharBalao();
	});
	ipcMain.handle("estudos:flutuante:capturar", (evento) => (daBalao(evento) ? capturarTela() : null));
	// A voz vive na página do balão; a bolinha pulsa e mostra os segundos por este aviso.
	ipcMain.on("estudos:flutuante:voz", (evento, ouvindo, segundos) => {
		if (!daBalao(evento)) return;
		const atual = vivaOuNula();
		if (!atual || atual.webContents.isDestroyed()) return;
		const s = typeof segundos === "number" && Number.isFinite(segundos) ? Math.max(0, Math.floor(segundos)) : 0;
		atual.webContents.send("estudos:flutuante:ouvindo", ouvindo === true, s);
	});

	// --- as duas
	ipcMain.handle("estudos:flutuante:abrir-app", (evento) => {
		if (daBolinha(evento) || daBalao(evento)) ctx.mostrarPrincipal();
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
