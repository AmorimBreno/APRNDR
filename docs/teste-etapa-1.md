# Teste da Etapa 1: o pi e o perfil de estudos nesta máquina

Objetivo: confirmar que o pi roda no Windows nativo com a configuração do perfil de estudos. Você abre o pi pelo atalho scripts\pi-estudos.cmd, faz algumas perguntas curtas e confere o que aparece. Não é uma aula de verdade; é um teste de que as peças estão ligadas.

Tempo: uns 15 a 20 minutos. Custo esperado: menos de US$ 0,30. O rodapé do pi mostra o gasto da sessão. No teste automático que o Claude Code fez, cada pergunta curta custou cerca de US$ 0,02.

No fim, anote o resultado de cada passo e mande para o Claude Code. A Etapa 1 só está pronta quando você aprovar.


## Antes de começar

1. Abra um Windows Terminal novo (feche e abra, não use uma aba que já estava aberta). Por quê: as chaves OPENROUTER_API_KEY e TAVILY_API_KEY estão nas variáveis de usuário do Windows, e um programa só enxerga essas variáveis se foi aberto depois de elas serem gravadas.

2. Confira as chaves com este comando no PowerShell. Ele só diz "ok" ou "FALTANDO" e não mostra o valor da chave:

```powershell
foreach ($n in "OPENROUTER_API_KEY","TAVILY_API_KEY") { if ([Environment]::GetEnvironmentVariable($n)) { "$n ok" } else { "$n FALTANDO" } }
```

   Você deve ver as duas linhas com "ok". Se alguma disser "FALTANDO", grave a variável de usuário de novo (Configurações do Windows, "Editar as variáveis de ambiente para sua conta") e abra outro terminal novo.

3. Opcional, mas recomendado: faça o Shift+Enter quebrar a linha no pi. A documentação do pi (terminal-setup.md) diz que o Windows Terminal precisa de um ajuste para mandar o Shift+Enter ao pi; sem ele, Shift+Enter envia a mensagem. No Windows Terminal, abra as configurações em JSON (Ctrl+Shift+,) e acrescente este objeto à lista "actions":

```json
{ "command": { "action": "sendInput", "input": "\u001b[13;2u" }, "keys": "shift+enter" }
```

   Feche o Windows Terminal por completo e abra de novo. Enquanto não fizer o ajuste, Ctrl+J também quebra a linha.


## Teste

1. Abra o pi com o atalho do perfil:

```powershell
C:\Users\breno\Projects\studies\scripts\pi-estudos.cmd
```

   Por quê: o atalho roda o pi numa pasta fora do repositório (%LOCALAPPDATA%\estudos-app\pi-teste), para o AGENTS.md e o CLAUDE.md do repositório, que são para o Claude Code, não entrarem no contexto do professor. Ele também carrega as extensões quiz, ask-user-question e visual-tools, as skills teach e visualize e o AGENTS.md do perfil com as regras de idioma e de estilo. O que você deve ver: a tela do pi abre sem mensagem de erro de extensão.

2. Digite /model e aperte Enter. Por quê: confirma que o pi está falando com o OpenRouter e usando o modelo padrão do settings.json global. O que você deve ver: uma lista de modelos do OpenRouter, com openai/gpt-6.1-sol marcado como o atual. Procure também z-ai/glm-5.3 e anthropic/claude-sonnet-5.5 digitando parte do nome; os dois devem aparecer, porque são os modelos do pesquisador e dos desenhistas. Saia da lista com Esc, sem trocar o modelo.

3. Faça uma pergunta curta de conteúdo, por exemplo: "Em até 5 frases: para que serve a variância?". Por quê: confere que o AGENTS.md do perfil chegou ao modelo. O que você deve ver: resposta em português do Brasil, começando direto pelo conteúdo, sem elogio e sem frase de transição vazia, com palavras comuns, dizendo para que serve antes de qualquer conta. Se aparecer uma fórmula, cada símbolo deve vir explicado. É normal o pi ler o arquivo da skill teach antes de responder.

4. Peça uma pergunta de checagem, por exemplo: "Faça uma pergunta de múltipla escolha para ver se eu entendi a variância". Por quê: testa a ferramenta quiz, que desenha no terminal e por isso o Claude Code não consegue testar sozinho. O que você deve ver: um quadro com a pergunta e as opções em português, entre elas a opção "Não sei". Escolha uma opção com as setas e Enter. O professor deve dizer se você acertou e explicar.

5. Faça uma pergunta que não tem resposta certa, por exemplo: "Antes de continuar, me pergunte qual tipo de exemplo eu prefiro para estudar variância". Por quê: testa a ferramenta ask_user_question, que também desenha no terminal. O que você deve ver: um quadro com a pergunta e opções em português, sem nenhuma marcada como recomendada. Escolha uma.

6. Faça uma pergunta que exige busca, por exemplo: "Pesquise na web qual é a versão mais recente do pacote npm @earendil-works/pi-coding-agent e cite a fonte". Por quê: testa as extensões globais web_search e web_fetch, que usam o Tavily. O que você deve ver: o pi chama web_search (aparece o nome da ferramenta na tela), a resposta cita pelo menos uma URL de fonte. A versão pode vir desatualizada: no teste automático a busca disse 1.1.0, mas a versão real é 1.2.0, porque o índice do Tavily guarda páginas antigas. Isso não é falha da ferramenta.

7. Saia do pi com Ctrl+C duas vezes (ou Ctrl+D com a caixa de texto vazia).

8. Teste o desenho das ferramentas visuais, no mesmo terminal:

```powershell
cd C:\Users\breno\Projects\studies
node scripts\testar-render.mjs
```

   Por quê: os desenhistas (mermaid-maker e svg-maker) usam esse mesmo código para gerar PNGs com o Edge e com o resvg. O que você deve ver: duas linhas começando com "ok", uma para mermaid e outra para svg, com o caminho de cada PNG (na pasta %TEMP%\estudos-render-teste). Abra os dois PNGs: o diagrama e a figura devem estar legíveis e com os acentos certos.


## O que ainda não deve funcionar

Os subagentes researcher, mermaid-maker e svg-maker não existem no pi do terminal do Windows. No checkpoint 1 eles eram criados pelo pi-interactive-subagents, que dependia do tmux, e o tmux não existe no Windows nativo. Eles chegam pelo app na Etapa 2, quando o núcleo cria os subagentes como sessões filhas.

Por isso, se o professor tentar chamar o researcher (a skill teach manda verificar fatos com ele) ou pedir um diagrama (a skill visualize manda um desenhista fazer), ele deve dizer que não consegue ou seguir sem o subagente. Isso é esperado e não reprova o teste.


## Se algo falhar

Mande para o Claude Code: o número do passo, o que você digitou, o que esperava e o que apareceu, com a mensagem de erro copiada do terminal. Nunca cole o valor das chaves; se uma mensagem de erro mostrar uma chave, apague esse trecho antes de mandar.


## Resultado

Anote aqui, passo a passo, "ok" ou o que deu errado.

Antes de começar (chaves e Shift+Enter):
1. Abrir o pi:
2. /model:
3. Pergunta de conteúdo:
4. Quiz:
5. ask_user_question:
6. Busca:
7. Sair do pi:
8. PNGs de teste:
