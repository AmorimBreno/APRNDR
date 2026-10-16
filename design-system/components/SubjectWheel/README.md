# SubjectWheel

A lista de cadernos do menu principal, em roda: cada giro do scroll anda uma linha e a linha do meio é a selecionada. Ela faz a transição para `brick` com texto `on-brick`; as outras ficam em `paper` com uma divisória fina (`paper-line`), e as pontas viram linhas pautadas vazias, como folha de caderno.

- `items`: `{ id, title, kicker, meta, cover }` — `title` grande (Unbounded, até duas linhas), `kicker` ("Caderno 03 · 4 módulos"), `meta` à direita ("62%"), `cover` com as props do `NotebookCover`.
- `value`/`onChange` controlam a linha do meio; `onOpen(id)` dispara com Enter ou clique na linha do meio (clique nas outras só traz para o meio). A última linha é "Novo plano de estudos" (`createLabel`, `onCreate`); `createLabel={false}` tira.
- Teclado: ↑ ↓, Page Up/Down, Home/End navegam; Enter abre. Tem `role="listbox"` com `aria-activedescendant`.
- Ponha dentro de uma folha `paper` com `radius-xl`, com um cabeçalho ("Selecione um caderno" e "03 / 05") e uma linha de ajuda embaixo. Altura = `wheel-row` × `visibleRows` (5).
- Ao abrir, a linha tijolo sobe e vira a `CourseBar` (veja a página Fluxo de estudo).
