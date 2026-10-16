# Mudanças do estudos-ia no design system

A pasta design-system/ é o design system APRNDR como foi exportado do Claude Design (2026-10-16). Para o app usá-la como pacote do workspace (@estudos/design-system), estas foram as mudanças. Ao trocar a pasta por uma exportação nova, refaça cada uma.

Arquivos novos:
- package.json: nome do pacote, exports (componentes, tokens.css e componentes.css) e o typecheck.
- tsconfig.json: estende o tsconfig.base.json do repositório, com o DOM.
- ESTUDOS.md: este arquivo.

Mudanças no código (o TypeScript do projeto é estrito e usa verbatimModuleSyntax):
- components/src/base.tsx, forms.tsx, lesson.tsx, nav.tsx, overlay.tsx: imports só de tipo marcados com `type` (Tone, IconName, OrnamentGlyph, FileItem).
- components/src/util.ts: `cx` aceita também `0n`, porque o `error` dos campos é ReactNode e `error && ...` pode dar bigint. Linha marcada com [estudos-ia].

Fora do pacote, também do estudos-ia: pnpm-workspace.yaml lista design-system.
