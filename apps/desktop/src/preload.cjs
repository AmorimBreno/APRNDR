// Preload da janela própria: expõe ao front só o que ele precisa saber do
// ambiente (para mostrar a barra do app). Sandbox ligado, então é CommonJS e
// não há nada de Node aqui além do process.
const { contextBridge, ipcRenderer } = require("electron");

const prefixo = "--estudos-altura-barra=";
const argumento = process.argv.find((a) => a.startsWith(prefixo));
const alturaBarra = Number(argumento?.slice(prefixo.length)) || 32;

const ehFlutuante = process.argv.includes("--estudos-janela=flutuante");

/** Ouve um evento do processo principal e devolve a função que cancela. */
function ouvir(canal, cb) {
	const ouvinte = (_evento, ...args) => cb(...args);
	ipcRenderer.on(canal, ouvinte);
	return () => ipcRenderer.removeListener(canal, ouvinte);
}

/** Só na janela da bolinha (o contrato é o docs/professor-flutuante.md, 2.3). */
const flutuante = {
	modo: () => ipcRenderer.invoke("estudos:flutuante:modo"),
	/** A disposição do balão ao lado da bolinha (no modo chat), ou null na bolinha. */
	disposicao: () => ipcRenderer.invoke("estudos:flutuante:disposicao"),
	/** A página desenhou a cena do modo novo: o Electron mostra a janela de novo (ela fica invisível durante a troca). */
	pintado: () => ipcRenderer.send("estudos:flutuante:pintado"),
	expandir: () => ipcRenderer.invoke("estudos:flutuante:expandir"),
	recolher: () => ipcRenderer.invoke("estudos:flutuante:recolher"),
	/** Leva a BOLINHA até (x, y) da tela (no modo chat, a janela anda junto); a promessa resolve quando a janela já andou (o arrasto espera por ela). */
	moverPara: (x, y) => ipcRenderer.invoke("estudos:flutuante:mover", x, y),
	capturarTela: () => ipcRenderer.invoke("estudos:flutuante:capturar"),
	abrirApp: () => ipcRenderer.invoke("estudos:flutuante:abrir-app"),
	esconder: () => ipcRenderer.invoke("estudos:flutuante:esconder"),
	/** O menu nativo do clique direito na bolinha (Abrir o chat, Abrir o app, Esconder o professor). */
	menu: () => ipcRenderer.invoke("estudos:flutuante:menu"),
	aoMudarModo: (cb) => ouvir("estudos:flutuante:modo-mudou", cb),
	aoAlternarVoz: (cb) => ouvir("estudos:flutuante:alternar-voz", () => cb()),
};

contextBridge.exposeInMainWorld("estudosDesktop", {
	plataforma: process.platform,
	/** Altura, em pixels da janela, da barra de título que o Windows reserva para os botões. */
	alturaBarra,
	/** Sai do app de verdade: fecha a janela e encerra o servidor (o que o parar.mjs faz). */
	sair: () => ipcRenderer.invoke("estudos:sair"),
	...(ehFlutuante ? { flutuante } : {}),
	/** A bolinha do professor, em qualquer janela do app. */
	bolinha: {
		ligada: () => ipcRenderer.invoke("estudos:bolinha:ligada"),
		ligar: (ligada) => ipcRenderer.invoke("estudos:bolinha:ligar", ligada === true),
	},
});
