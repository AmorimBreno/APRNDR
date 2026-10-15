# estudos-ia, branch app-perfis

Antes de qualquer tarefa: AGENTS.md (regras do projeto), ESPECIFICACAO.md (o que o app é; a seção 13 tem as decisões mais recentes) e docs/PLANO.md (etapas e estado atual). Para achar arquivos: filemap.md.

Stack: TypeScript, monorepo pnpm, Node 24 com o SDK do pi (@earendil-works/pi-coding-agent 1.2.0), React com Vite. Roda no Windows nativo.

## Comandos

- node scripts/instalar-pi-global.mjs: copia pi-global/ para ~/.pi/agent. Rode de novo depois de mudar algo em pi-global/.
- node scripts/testar-render.mjs: gera PNGs de teste de mermaid e de SVG.
- A partir da Etapa 2: pnpm install, pnpm dev, pnpm typecheck, pnpm test.

## Convenções

- Português do Brasil em documentos, mensagens de commit e textos que o Breno vê. Commits pequenos, um por passo. Push só com o ok do Breno.
- Chaves de API vêm só das variáveis de ambiente do usuário do Windows: OPENROUTER_API_KEY e TAVILY_API_KEY. Nunca em arquivos e nunca impressas em logs.
- Dados do usuário ficam em G:\Meu Drive\estudos-dados, nunca no repositório. Índice e logs ficam em %LOCALAPPDATA%\estudos-app.
- O AGENTS.md e este CLAUDE.md são para o Claude Code. Eles não podem entrar no contexto das sessões do pi: o núcleo cria as sessões com cwd na pasta de dados e passa só o AGENTS.md do perfil. Para testar o pi no terminal, rode a partir de uma pasta fora do repositório.
- Arquivos vindos do learn (profiles/estudos: skills, agents e extensions): as mudanças devem ser mínimas, marcadas com o comentário [estudos-ia] e listadas em profiles/estudos/ORIGEM.md.
- Não chute a API do pi. A documentação está em github.com/earendil-works/pi, em packages/coding-agent/docs, e os tipos estão no pacote instalado.
- Ao adicionar ou mover arquivos, atualize o filemap.md.
