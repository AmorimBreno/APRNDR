# Mudanças do estudos-ia no design system

A pasta design-system/ é o design system APRNDR como foi exportado do Claude Design (2026-10-16). Para o app usá-la como pacote do workspace (@estudos/design-system), estas foram as mudanças. Ao trocar a pasta por uma exportação nova, refaça cada uma.

Arquivos novos:
- package.json: nome do pacote, exports (componentes, tokens.css e componentes.css) e o typecheck.
- tsconfig.json: estende o tsconfig.base.json do repositório, com o DOM.
- ESTUDOS.md: este arquivo.

Mudanças no código (o TypeScript do projeto é estrito e usa verbatimModuleSyntax):
- components/src/base.tsx, forms.tsx, lesson.tsx, nav.tsx, overlay.tsx: imports só de tipo marcados com `type` (Tone, IconName, OrnamentGlyph, FileItem).
- components/src/util.ts: `cx` aceita também `0n`, porque o `error` dos campos é ReactNode e `error && ...` pode dar bigint. Linha marcada com [estudos-ia].
- components/src/nav.tsx e components/index.d.ts: a SubjectWheel ganhou `createKicker`, a linha pequena acima do rótulo da linha de criar (o padrão continua "Criar com o tutor"). Na tela de cadernos a matéria nova é criada num modal, não com o tutor. Linhas marcadas com [estudos-ia]. O components/bundle.js não foi refeito: o app usa o src.

Fora do pacote, também do estudos-ia: pnpm-workspace.yaml lista design-system.

## Regras do app que mudam o manual

O README.md continua como foi exportado. Onde o app segue outra regra, por decisão do Breno, ela fica aqui.

- Movimento (2026-10-16). O manual pede "movimento curto (120–320ms, ease-out), sem bounce". O app usa animação com física: molas com um pouco de bounce, entradas brincalhonas, texto que aparece, elementos que se transformam uns nos outros (View Transitions do navegador e a biblioteca Motion). Continua valendo: tudo para com prefers-reduced-motion, e nada de brilho, degradê ou desfoque.
- Escala (2026-10-16). O app roda com zoom de 90% na raiz: os tamanhos do manual ficaram grandes demais na tela do Breno.
