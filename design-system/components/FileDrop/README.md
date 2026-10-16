# FileDrop

Área de soltar arquivos (PDF das aulas, código .py) com a lista do que já foi anexado: enviando, pronto ou com erro.

- `label`, `title` (padrão "Arraste os arquivos aqui"), `hint`, `accept` (".pdf,.py"), `multiple`, `disabled`.
- Quem usa controla a lista: `files` (`{ name, size, kind, progress, error }`), `onFiles(File[])` e `onRemove(file, index)`. `kind` sai da extensão se omitido.
- Diga os limites na ajuda ("PDF e .py até 20 MB cada") e o motivo no erro de cada arquivo.
