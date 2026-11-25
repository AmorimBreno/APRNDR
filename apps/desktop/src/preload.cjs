// Preload da janela própria: expõe ao front só o que ele precisa saber do
// ambiente (para mostrar a barra do app). Sandbox ligado, então é CommonJS e
// não há nada de Node aqui além do process.
const { contextBridge, ipcRenderer } = require("electron");

const prefixo = "--estudos-altura-barra=";
const argumento = process.argv.find((a) => a.startsWith(prefixo));
const alturaBarra = Number(argumento?.slice(prefixo.length)) || 32;

const ehFlutuante = process.argv.includes("--estudos-janela=flutuante");
const ehBalao = process.argv.includes("--estudos-janela=balao");

/** Ouve um evento do processo principal e devolve a função que cancela. */
function ouvir(canal, cb) {
	const ouvinte = (_evento, ...args) => cb(...args);
	ipcRenderer.on(canal, ouvinte);
	return () => ipcRenderer.removeListener(canal, ouvinte);
}

/** Só na janela da bolinha (o contrato é o docs/professor-flutuante.md, 2.3). */
const flutuante = {
	/** Abre o balão do chat ao lado da bolinha, ou o fecha se está aberto. */
	alternarBalao: () => ipcRenderer.invoke("estudos:flutuante:alternar-balao"),
	/** Leva a BOLINHA até (x, y) da tela (o balão aberto anda junto); a promessa resolve quando a janela já andou (o arrasto espera por ela). */
	moverPara: (x, y) => ipcRenderer.invoke("estudos:flutuante:mover", x, y),
	abrirApp: () => ipcRenderer.invoke("estudos:flutuante:abrir-app"),
	esconder: () => ipcRenderer.invoke("estudos:flutuante:esconder"),
	/** O menu nativo do clique direito na bolinha (Abrir o chat, Abrir o app, Esconder o professor). */
	menu: () => ipcRenderer.invoke("estudos:flutuante:menu"),
	/** A voz do balão: ouvindo ou não e os segundos gravados (para a bolinha pulsar). */
	aoOuvindo: (cb) => ouvir("estudos:flutuante:ouvindo", (ouvindo, segundos) => cb(ouvindo === true, Number(segundos) || 0)),
};

/** Só na janela do balão. */
const balao = {
	/** A disposição atual do balão (o lado da bolinha e a ponta), ou null se ainda não abriu. */
	disposicao: () => ipcRenderer.invoke("estudos:flutuante:disposicao"),
	/** O Electron mandou uma disposição nova (o balão abriu ou a tela mudou). */
	aoMudarDisposicao: (cb) => ouvir("estudos:flutuante:disposicao-mudou", cb),
	fecharBalao: () => ipcRenderer.invoke("estudos:flutuante:fechar-balao"),
	capturarTela: () => ipcRenderer.invoke("estudos:flutuante:capturar"),
	abrirApp: () => ipcRenderer.invoke("estudos:flutuante:abrir-app"),
	/** O atalho Ctrl+Alt+Espaço. */
	aoAlternarVoz: (cb) => ouvir("estudos:flutuante:alternar-voz", () => cb()),
	/** Diz à bolinha (pelo Electron) que a gravação começou, parou ou avançou. */
	avisarVoz: (ouvindo, segundos) => ipcRenderer.send("estudos:flutuante:voz", ouvindo === true, Number(segundos) || 0),
};

contextBridge.exposeInMainWorld("estudosDesktop", {
	plataforma: process.platform,
	/** Altura, em pixels da janela, da barra de título que o Windows reserva para os botões. */
	alturaBarra,
	/** Sai do app de verdade: fecha a janela e encerra o servidor (o que o parar.mjs faz). */
	sair: () => ipcRenderer.invoke("estudos:sair"),
	...(ehFlutuante ? { flutuante } : {}),
	...(ehBalao ? { balao } : {}),
	/** A bolinha do professor, em qualquer janela do app. */
	bolinha: {
		ligada: () => ipcRenderer.invoke("estudos:bolinha:ligada"),
		ligar: (ligada) => ipcRenderer.invoke("estudos:bolinha:ligar", ligada === true),
	},
});
