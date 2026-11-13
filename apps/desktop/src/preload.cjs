// Preload da janela própria: expõe ao front só o que ele precisa saber do
// ambiente (para mostrar a barra do app). Sandbox ligado, então é CommonJS e
// não há nada de Node aqui além do process.
const { contextBridge } = require("electron");

const prefixo = "--estudos-altura-barra=";
const argumento = process.argv.find((a) => a.startsWith(prefixo));
const alturaBarra = Number(argumento?.slice(prefixo.length)) || 32;

contextBridge.exposeInMainWorld("estudosDesktop", {
	plataforma: process.platform,
	/** Altura, em pixels da janela, da barra de título que o Windows reserva para os botões. */
	alturaBarra,
});
