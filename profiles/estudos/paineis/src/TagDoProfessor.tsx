// A tag "do professor" nos itens da lista de notas que o professor criou (parte D, WP2; docs/mesa-parte-d.md,
// seções 1 e 2): a primeira linha da nota é a marca, e a lista traz `doProfessor: true`. Tamanho fixo (mesa.css,
// .tag-professor): uma linha, sem quebrar, que não muda a altura do item.

export function TagDoProfessor() {
	return (
		<span className="tag-professor overline" title="Nota criada pelo professor">
			do professor
		</span>
	);
}
