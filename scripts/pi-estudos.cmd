@echo off
REM Abre o pi no terminal com a configuração do perfil de estudos.
REM Serve só para testar o perfil antes do app (Etapa 1). O app (Etapa 2) cria
REM as sessões pelo SDK e não usa este atalho.
REM
REM Uso: scripts\pi-estudos.cmd [argumentos extras do pi]
REM Os argumentos extras vão direto para o pi, por exemplo --model ou -p.
REM
REM As chaves OPENROUTER_API_KEY e TAVILY_API_KEY vêm das variáveis de
REM usuário do Windows. Um terminal aberto depois de elas serem criadas já as
REM tem. Este script não lê nem grava chaves.

REM setlocal: as variáveis abaixo somem quando o script termina, sem sujar o
REM terminal de quem chamou.
setlocal

REM Raiz do repositório = pasta acima da pasta deste script. %~dp0 é a pasta
REM do script; o for transforma "scripts\.." num caminho absoluto limpo. Assim
REM o atalho funciona de qualquer pasta em que o terminal estiver.
for %%I in ("%~dp0..") do set "RAIZ=%%~fI"
set "PERFIL=%RAIZ%\profiles\estudos"

REM O pi lê AGENTS.md e CLAUDE.md da pasta onde roda e das pastas acima. Os da
REM raiz do repositório são para o Claude Code e não podem entrar no contexto
REM do professor. Por isso o pi roda numa pasta fora do repositório, em
REM %LOCALAPPDATA%\estudos-app\pi-teste, criada aqui se ainda não existir.
set "PASTA_TESTE=%LOCALAPPDATA%\estudos-app\pi-teste"
if not exist "%PASTA_TESTE%" mkdir "%PASTA_TESTE%"
cd /d "%PASTA_TESTE%"

REM O que cada opção carrega:
REM -e quiz.ts e -e ask-user-question.ts: as ferramentas quiz e
REM   ask_user_question, que desenham no terminal.
REM -e visual-tools: as ferramentas de desenho. Sem o interactive-subagents
REM   (que dependia do tmux) ela não registra nada; é carregada para conferir
REM   que abre sem erro no Windows.
REM --skill teach e --skill visualize: o método de ensino e a skill de
REM   diagramas.
REM --append-system-prompt AGENTS.md do perfil: o pi só procura arquivos de
REM   contexto no cwd e acima; para um arquivo de outra pasta, a documentação
REM   (cli.md) indica --append-system-prompt, que aceita o caminho do arquivo.
REM --no-context-files: desliga a busca de AGENTS.md e CLAUDE.md, para o
REM   AGENTS.md do perfil ser a única instrução fixa, como o núcleo fará no app
REM   (ESPECIFICACAO.md, 13.6).
REM As extensões globais web_search e web_fetch (em ~/.pi/agent) continuam
REM carregando normalmente; o modelo padrão vem do settings.json global.
REM call: o pi é um .cmd do npm; sem call, o controle não voltaria para cá.
call pi ^
  -e "%PERFIL%\extensions\quiz.ts" ^
  -e "%PERFIL%\extensions\ask-user-question.ts" ^
  -e "%PERFIL%\extensions\visual-tools" ^
  --skill "%PERFIL%\skills\teach" ^
  --skill "%PERFIL%\skills\visualize" ^
  --append-system-prompt "%PERFIL%\AGENTS.md" ^
  --no-context-files ^
  %*

REM Devolve o código de saída do pi para quem chamou o script.
exit /b %ERRORLEVEL%
