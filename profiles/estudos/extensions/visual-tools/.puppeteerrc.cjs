// [estudos-ia] Não baixar o Chrome do puppeteer no npm install (cerca de 700 MB).
// O mermaid-cli desenha com o navegador que findChrome() acha em tools/_common.ts
// (no Windows, o Edge), passado como executablePath.
module.exports = {
  skipDownload: true,
  chrome: { skipDownload: true },
  "chrome-headless-shell": { skipDownload: true },
}
