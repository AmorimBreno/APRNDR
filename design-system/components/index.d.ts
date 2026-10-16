/* APRNDR — tipos dos componentes (documentação; não é verificado). Fonte: components/src/*.tsx. */
import * as React from 'react';

/* ───── util ───── */
/** Junta classes ignorando valores falsos. */
export declare function cx(...parts: Array<string | false | null | undefined | 0>): string;
/** As seis cores de marca que viram preenchimento chapado. */
export type Tone = 'amber' | 'brick' | 'sage' | 'moss' | 'cream' | 'steel';
/** Número com dois dígitos, no estilo de painel: 3 → "03". */
export declare function pad2(n: number): string;
/** Letra da alternativa: 0 → "A". */
export declare function letter(i: number): string;

/* ───── icons ───── */
export type IconName = 'arrow-right' | 'arrow-left' | 'arrow-up' | 'arrow-up-right' | 'send' | 'plus' | 'close' | 'check' | 'chevron-down' | 'chevron-right' | 'paperclip' | 'file' | 'code' | 'upload' | 'refresh' | 'copy' | 'stop' | 'book' | 'notebook' | 'bulb' | 'help' | 'alert' | 'clock' | 'chart' | 'list' | 'checklist' | 'flag' | 'lock' | 'message';
/**
 * Desenhos em grade de 24px, traço 2px, pontas quadradas e quinas vivas.
 * `fill: true` = forma cheia (sem traço).
 */
export declare const ICONS: Record<IconName, {
    d: string;
    fill?: boolean;
}>;
export declare const ICON_NAMES: IconName[];
export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'name' | 'ref'> {
    /** Nome do desenho (veja ICON_NAMES). */
    name: IconName;
    /** Lado em px. Padrão 20. */
    size?: number;
    /** Espessura do traço na grade de 24. Padrão 2; use 2.5–3.5 em ícones grandes decorativos. */
    strokeWidth?: number;
    /** Texto para leitor de tela. Sem ele, o ícone é decorativo (aria-hidden). */
    label?: string;
}
/** Ícone de traço único que herda a cor do texto (currentColor). */
export declare function Icon(props: IconProps): React.JSX.Element | null;

/* ───── base ───── */
export interface WordmarkProps extends React.HTMLAttributes<HTMLSpanElement> {
    /** Tamanho da letra em px. Padrão 28. */
    size?: number;
    /** O ponto de sinal em tijolo depois do nome. Padrão true. */
    dot?: boolean;
}
/** O nome APRNDR em Unbounded pesada, com o ponto de sinal em tijolo — a marca tipográfica do app. */
export declare function Wordmark(props: WordmarkProps): React.JSX.Element;
/** Ideogramas disponíveis na fonte de ornamento (recorte da Zen Antique). */
export type OrnamentGlyph = '学' | '習' | '学習' | '知' | '問' | '答' | '考' | '解' | '読' | '書' | '復習' | '試験' | '完' | '独創' | '新' | '始' | '終' | '一' | '二' | '三' | '四' | '五' | '六' | '七' | '八' | '九' | '十';
/** Tradução padrão de cada ornamento, mostrada como legenda vertical. */
export declare const ORNAMENT_MEANINGS: Record<OrnamentGlyph, string>;
export interface OrnamentProps extends React.HTMLAttributes<HTMLSpanElement> {
    /** Um dos ideogramas da lista OrnamentGlyph. Dois caracteres empilham na vertical. */
    glyph: OrnamentGlyph;
    /** Legenda vertical em português. Padrão: a tradução do ideograma; false esconde. */
    caption?: string | false;
    /** 'xl' (160px, capas e telas vazias) ou 'md' (56px, cabeçalhos e cards). */
    size?: 'md' | 'xl';
}
/** Ideograma japonês decorativo em pé, com a tradução em letra de painel ao lado — o ornamento-pôster do sistema. */
export declare function Ornament(props: OrnamentProps): React.JSX.Element;
export interface StickerProps extends React.HTMLAttributes<HTMLSpanElement> {
    /** Cor do miolo. Padrão ink (quase preto, texto papel). holo = vinil holográfico, só para conclusão. */
    tone?: 'ink' | 'holo' | Tone;
    /** Linha pequena em letra de painel acima do texto ("Módulo 03"). */
    kicker?: React.ReactNode;
    /** Ponto de sinal antes do texto (tijolo; papel no miolo brick). */
    dot?: boolean;
    /** Giro em graus; positivo = sentido horário. Padrão 0. */
    rotate?: number;
    /** Gruda no canto do elemento pai (que precisa de position: relative), saindo um pouco para fora. */
    pin?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
    /** rect (padrão) ou pill. */
    shape?: 'rect' | 'pill';
}
/** Adesivo de papel colado: borda branca grossa, miolo de cor chapada e letra grossa. Prende no canto de um card como um post-it. */
export declare function Sticker(props: StickerProps): React.JSX.Element;
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /** primary = âmbar, no máximo um por tela; secondary = padrão; ghost = sem caixa; danger = tijolo. */
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    /** sm 32px · md 40px · lg 48px. */
    size?: 'sm' | 'md' | 'lg';
    /** Ícone antes do rótulo. */
    icon?: IconName;
    /** Ícone depois do rótulo (ex.: arrow-right em "Próxima"). */
    iconRight?: IconName;
    /** Botão só com ícone: quadrado; passe aria-label. */
    iconOnly?: boolean;
    /** Ocupa a largura toda. */
    block?: boolean;
}
/** Botão com cara de tecla de computador antigo: rótulo em caixa-alta larga e lábio inferior que afunda ao clicar. */
export declare const Button: React.ForwardRefExoticComponent<ButtonProps & React.RefAttributes<HTMLButtonElement>>;
export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
    /** neutral (papel, padrão), outline (só contorno, para o fundo escuro) ou uma das cores de marca em pastel. */
    tone?: 'neutral' | 'outline' | Tone;
    /** Ícone de traço antes do texto, na cor do texto: diz o que a tag é (Concluído = check, PDF = file…). */
    icon?: IconName;
    /** Ponto de sinal no lugar do ícone ("Ao vivo"). */
    dot?: boolean;
    /** md = 32px (padrão) · sm = 26px, para rótulos de bloco e linhas densas. */
    size?: 'sm' | 'md';
}
/** Etiqueta em pílula pastel: contorno de 2px, fundo claro, texto escuro e um ícone de traço que diz o que ela é. Uma a três palavras. */
export declare function Tag(props: TagProps): React.JSX.Element;
export interface CardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
    /** Cor do bloco. panel = neutro escuro; as outras são chapadas, com texto na cor on-*. */
    tone?: 'panel' | Tone;
    /** Número no canto superior esquerdo ("01"). */
    index?: React.ReactNode;
    /** Legenda no canto superior direito. */
    label?: React.ReactNode;
    /** Título em letra larga, caixa-alta. */
    title?: React.ReactNode;
    /** Linha de rodapé em letra de painel. */
    footer?: React.ReactNode;
    /** Elemento HTML. Padrão section. */
    as?: 'section' | 'article' | 'div' | 'li';
    /** Bloco-pôster maior (raio e respiro maiores). */
    poster?: boolean;
}
/** Bloco do bento: cor chapada, cantos grandes, índice e legenda nos cantos, como numa ficha técnica. */
export declare function Card(props: CardProps): React.JSX.Element;
export interface CalloutAction {
    /** Volta em onAction ("ask", "rephrase", "example"). */
    id: string;
    label: string;
    icon?: IconName;
}
/** As três opções padrão do menu dos três pontos. */
export declare const CALLOUT_ACTIONS: CalloutAction[];
export interface CalloutProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
    /** moss = ideia central (padrão); amber = atenção; steel = exemplo; cream = resumo. */
    tone?: 'moss' | 'amber' | 'steel' | 'cream';
    /** Título na aba. Padrão conforme o tom ("Ideia central", "Atenção", "Exemplo", "Resumo"). */
    label?: React.ReactNode;
    /** Ícone do círculo preto. Padrão conforme o tom. */
    icon?: IconName;
    /** Texto em Fraunces itálica (a frase-chave). Padrão true no tom moss. */
    quote?: boolean;
    /** Opções do menu dos três pontos. Padrão CALLOUT_ACTIONS. */
    actions?: CalloutAction[];
    /** Recebe o id da opção escolhida. Sem ele, o callout não tem a aba dos três pontos. */
    onAction?: (id: string) => void;
}
/**
 * Caixa de destaque dentro das explicações, em formato de pasta: o bloco inteiro na cor do tipo, a aba do título com o
 * ícone num círculo preto e, à direita, a aba preta dos três pontos, que abre um menu (perguntar, reexplicar, exemplo).
 */
export declare function Callout(props: CalloutProps): React.JSX.Element;
export interface ProseProps extends React.HTMLAttributes<HTMLDivElement> {
    /** lg = 17/28 (leitura, padrão); md = 15/24 (painéis estreitos). */
    size?: 'md' | 'lg';
}
/** Estilo de leitura para conteúdo gerado (markdown renderizado): parágrafos, títulos, listas, código, citações e tabelas. */
export declare function Prose(props: ProseProps): React.JSX.Element;
export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
    /** Ideograma do bloco-pôster. Padrão 学 (aprender). */
    glyph?: OrnamentGlyph;
    /** Cor do bloco do ideograma. Padrão brick. */
    tone?: Tone;
    title: React.ReactNode;
    /** Ação principal (normalmente um Button primary). */
    action?: React.ReactNode;
}
/** Tela vazia com um bloco-pôster de ideograma: diz o que falta e oferece a única ação que resolve. */
export declare function EmptyState(props: EmptyStateProps): React.JSX.Element;

/* ───── nav ───── */
export interface NotebookCoverProps extends React.HTMLAttributes<HTMLSpanElement> {
    /** Cor da capa. Evite brick na lista de cadernos: a linha selecionada já é tijolo. */
    tone?: 'ink' | Tone;
    /** Ideograma da etiqueta (um da lista do Ornament). */
    glyph?: OrnamentGlyph;
    /** Nome curto na etiqueta ("Cálculo"). Some no tamanho sm. */
    label?: string;
    /** Número do caderno ("03"). */
    number?: string | number;
    /** sm 40×52 · md 72×96 (padrão) · lg 120×160. */
    size?: 'sm' | 'md' | 'lg';
}
/** Capa de caderno desenhada: lombada, elástico e uma etiqueta de papel com ideograma e nome — a imagem de cada matéria. Decorativa. */
export declare function NotebookCover(props: NotebookCoverProps): React.JSX.Element;
export interface SubjectItem {
    id: string;
    /** Nome da matéria, grande. */
    title: string;
    /** Linha pequena acima ("Caderno 03 · 4 módulos"). */
    kicker?: React.ReactNode;
    /** À direita nas linhas não selecionadas ("62%"). */
    meta?: React.ReactNode;
    cover?: NotebookCoverProps;
}
/** id da linha "Novo plano de estudos". */
export declare const CREATE_ID = "__create__";
export interface SubjectWheelProps {
    items: SubjectItem[];
    /** id selecionado (a linha do meio). */
    value?: string;
    defaultValue?: string;
    onChange?: (id: string) => void;
    /** Enter, ou clique na linha do meio. */
    onOpen?: (id: string) => void;
    /** Rótulo da linha extra no fim; false esconde. Padrão "Novo plano de estudos". */
    createLabel?: string | false;
    onCreate?: () => void;
    /** Linhas visíveis (ímpar). Padrão 5. */
    visibleRows?: number;
    /** Nome acessível da lista. Padrão "Cadernos". */
    label?: string;
    /** Texto da tecla na linha selecionada. Padrão "Abrir". */
    openLabel?: string;
    className?: string;
}
/**
 * Lista de cadernos em roda: cada giro do scroll anda uma linha e a linha do meio é a selecionada —
 * ela vira tijolo com texto claro; as outras ficam na folha clara com uma divisória fina.
 * Setas, Page Up/Down, Home/End navegam; Enter abre; clicar traz a linha para o meio.
 */
export declare function SubjectWheel(props: SubjectWheelProps): React.JSX.Element;
export type TrackKind = 'module' | 'quiz' | 'final';
export type TrackState = 'done' | 'current' | 'todo' | 'locked';
export interface TrackStep {
    id: string;
    /** module (livro), quiz (prancheta) ou final (bandeira). */
    kind: TrackKind;
    /** Nome curto ("Módulo 03 · Derivadas"). Aparece no hover e, na atual, fixo embaixo. */
    label: string;
    /** done, current, todo ou locked (módulo ainda não gerado). */
    state: TrackState;
}
export interface ProgressTrackProps extends React.HTMLAttributes<HTMLOListElement> {
    steps: TrackStep[];
    /** Deixa pular para uma etapa (não vale para locked). */
    onStepClick?: (id: string) => void;
    /** Nome acessível. Padrão "Trilha do curso". */
    label?: string;
}
/**
 * Trilha do curso: uma estação por etapa — módulo (livro, círculo), questionário (prancheta, quadrado arredondado)
 * e teste final (bandeira, quadrado maior). Feita = cheia; atual = âmbar com o nome embaixo; a fazer = contorno;
 * ainda não gerada = contorno tracejado. Módulo e seu questionário ficam colados.
 */
export declare function ProgressTrack(props: ProgressTrackProps): React.JSX.Element;
export interface CourseBarProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
    /** Nome do curso. */
    title: React.ReactNode;
    /** Linha pequena acima do nome ("Caderno 03 · Módulo 03"). */
    kicker?: React.ReactNode;
    /** Capa pequena ao lado do nome. */
    cover?: NotebookCoverProps;
    steps: TrackStep[];
    onStepClick?: (id: string) => void;
    /** Volta para a lista de cadernos. */
    onBack?: () => void;
    /** Padrão "Matérias". */
    backLabel?: string;
    /** Bloco "Próximo" à direita. */
    next?: {
        label: React.ReactNode;
        kicker?: React.ReactNode;
        onClick?: () => void;
    };
}
/** A aba tijolo no topo do curso: voltar às matérias, capa e nome do curso, a trilha de progresso e o próximo passo. */
export declare function CourseBar(props: CourseBarProps): React.JSX.Element;
export type ModuleState = 'done' | 'current' | 'next' | 'locked';
export interface ModuleReading {
    /** Rótulo de painel, até duas linhas ("Questões restantes"). */
    label: React.ReactNode;
    value: React.ReactNode;
    /** Unidade depois do valor ("min", "/10"). */
    unit?: React.ReactNode;
}
export interface ModuleCardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
    /**
     * done = concluído (holográfico, carimbo 完) · current = em curso (âmbar, adesivo) ·
     * next = o próximo, já liberado (musgo) · locked = desativado: ainda não começou e não é o próximo (tracejado).
     */
    state: ModuleState;
    /** Número do módulo: 3 vira "Módulo 03" e "#MOD-03". */
    number: number;
    /** Nome do módulo ("Derivadas"). */
    title: React.ReactNode;
    /** Nome do curso, depois do número ("Cálculo I"). */
    course?: React.ReactNode;
    /** 0 a 1 — o número grande. done mostra sempre 100%; locked mostra o mostrador apagado (--%). */
    progress?: number;
    /** Até duas leituras na ficha da direita: { label: "Questões restantes", value: "12" }. */
    readings?: ModuleReading[];
    /** Texto da ação no rodapé. Padrão: Rever · Continuar · Começar; em locked, "Abre depois do Módulo NN". */
    action?: React.ReactNode;
    /** Abre o módulo; o card inteiro fica clicável (nunca em locked). */
    onOpen?: () => void;
    /** Elemento HTML. Padrão article; use li dentro de uma lista. */
    as?: 'article' | 'li' | 'div';
}
/**
 * Card de módulo do curso, em quatro estados. Concluído: holográfico (faixas de rosa, pêssego, manteiga, menta,
 * céu e lilás que brilham seguindo o ponteiro) com o carimbo 完. Em curso: âmbar com o adesivo "Em curso".
 * Próximo: musgo, já liberado. Desativado: tracejado, com o mostrador apagado e a regra de quando abre.
 * O número grande é a porcentagem concluída do módulo.
 */
export declare function ModuleCard(props: ModuleCardProps): React.JSX.Element;

/* ───── forms ───── */
interface FieldBase {
    /** Rótulo em caixa-alta acima do campo. */
    label?: React.ReactNode;
    /** Texto de ajuda abaixo do campo. */
    hint?: React.ReactNode;
    /** Mensagem de erro; troca a ajuda e pinta a borda. */
    error?: React.ReactNode;
}
export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>, FieldBase {
    /** Ícone dentro do campo, à esquerda. */
    icon?: IconName;
    /** md 40px (padrão) · lg 48px. */
    size?: 'md' | 'lg';
}
/** Campo de texto de uma linha com rótulo de painel, ajuda e erro. */
export declare const TextField: React.ForwardRefExoticComponent<TextFieldProps & React.RefAttributes<HTMLInputElement>>;
export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement>, FieldBase {
    /** Mostra o contador "caracteres/máximo" quando há maxLength. Padrão true. */
    counter?: boolean;
}
/** Campo de várias linhas para respostas e anotações, com contador de caracteres. */
export declare const TextArea: React.ForwardRefExoticComponent<TextAreaProps & React.RefAttributes<HTMLTextAreaElement>>;
export type SelectOption = string | {
    value: string;
    label: string;
    disabled?: boolean;
};
export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>, FieldBase {
    options: SelectOption[];
    /** sm 32px (barras de ferramenta) · md 40px (padrão). */
    size?: 'sm' | 'md';
}
/** Lista de escolha nativa com a cara dos campos do sistema (ex.: escolher o modelo de IA). */
export declare const Select: React.ForwardRefExoticComponent<SelectProps & React.RefAttributes<HTMLSelectElement>>;
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
    label: React.ReactNode;
    /** Linha de apoio sob o rótulo. */
    description?: React.ReactNode;
}
/** Caixa de marcação quadrada; marcada vira âmbar com o visto escuro. */
export declare const Checkbox: React.ForwardRefExoticComponent<CheckboxProps & React.RefAttributes<HTMLInputElement>>;
export interface RadioOption {
    value: string;
    label: React.ReactNode;
    description?: React.ReactNode;
    disabled?: boolean;
}
export interface RadioGroupProps extends Omit<React.FieldsetHTMLAttributes<HTMLFieldSetElement>, 'onChange'> {
    /** Pergunta do grupo, em caixa-alta. */
    legend: React.ReactNode;
    /** name compartilhado pelos inputs. Padrão: gerado. */
    name?: string;
    options: RadioOption[];
    value?: string;
    defaultValue?: string;
    onChange?: (value: string) => void;
    /** vertical (padrão) ou horizontal. */
    orientation?: 'vertical' | 'horizontal';
}
/** Grupo de opções exclusivas com legenda: nível, objetivo, "teórico ou aplicado". */
export declare function RadioGroup(props: RadioGroupProps): React.JSX.Element;
export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
    label: React.ReactNode;
    description?: React.ReactNode;
}
/** Chave liga/desliga em pílula, no desenho de seletor ○●. Efeito imediato, sem botão salvar. */
export declare const Switch: React.ForwardRefExoticComponent<SwitchProps & React.RefAttributes<HTMLInputElement>>;
export interface FileItem {
    id?: string;
    name: string;
    /** Bytes (número) ou texto pronto ("2,4 MB"). */
    size?: number | string;
    /** pdf, code ou file. Padrão: deduzido da extensão. */
    kind?: 'pdf' | 'code' | 'file';
    /** 0–1 enquanto envia. */
    progress?: number;
    error?: string;
}
export declare function formatBytes(size: number | string | undefined): string;
/** Linha de arquivo anexado: ícone, nome, tipo, tamanho e botão de remover. Usada no FileDrop, na AskBar e nas notas do aluno. */
export declare function FileRow({ file, onRemove, compact }: {
    file: FileItem;
    onRemove?: () => void;
    compact?: boolean;
}): React.JSX.Element;
export interface FileDropProps extends FieldBase {
    /** Chamada da área. Padrão "Arraste os arquivos aqui". */
    title?: React.ReactNode;
    /** Tipos aceitos, como no input file (".pdf,.py"). */
    accept?: string;
    multiple?: boolean;
    /** Arquivos já anexados (controlado por quem usa). */
    files?: FileItem[];
    onFiles?: (files: File[]) => void;
    onRemove?: (file: FileItem, index: number) => void;
    disabled?: boolean;
    className?: string;
}
/** Área de soltar arquivos (PDF das aulas, código .py) com a lista do que já foi anexado. */
export declare function FileDrop(props: FileDropProps): React.JSX.Element;

/* ───── lesson ───── */
/** O ícone de cada tipo de bloco, usado quando o rótulo é um destes textos. */
export declare const BLOCK_ICONS: Record<string, IconName>;
export interface LessonBlockProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
    /** Número do bloco, mostrado na margem ("03"). */
    index?: number;
    /** Tipo do bloco: "Explicação", "Exemplo", "Pergunta", "Resposta", "Reexplicação", "Revisão". Vira uma tag aço com ícone. */
    label?: React.ReactNode;
    /** Ícone da tag do rótulo. Padrão: o de BLOCK_ICONS para o texto do rótulo. */
    icon?: IconName;
    /** O tutor ainda está escrevendo: cursor âmbar piscando no fim do texto. */
    writing?: boolean;
    /** Ações sob o bloco (Button ghost sm: Reexplicar, Outro exemplo). */
    actions?: React.ReactNode;
}
/**
 * Um bloco da aula ao vivo. O tutor escreve a aula numa coluna única, bloco a bloco, como uma página de caderno:
 * número na margem, rótulo do tipo e o texto em `lesson-body` (19/32). Perguntas entram como QuizQuestion/EssayAnswer dentro do bloco.
 */
export declare function LessonBlock(props: LessonBlockProps): React.JSX.Element;
export interface StudentNoteProps extends React.HTMLAttributes<HTMLElement> {
    /** Rótulo. Padrão "Você perguntou"; use "Sua resposta", "Você pediu". */
    label?: React.ReactNode;
    /** Arquivos que você anexou nesse momento da aula. */
    attachments?: FileItem[];
}
/** A sua intervenção na aula — uma pergunta, uma resposta, um "não entendi" — como um bilhete de papel creme colado à direita da página. */
export declare function StudentNote(props: StudentNoteProps): React.JSX.Element;
export type Suggestion = string | {
    label: string;
    value?: string;
    icon?: IconName;
};
export interface SuggestionChipsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
    items: Suggestion[];
    onSelect?: (value: string) => void;
    /** Nome acessível do grupo. Padrão "Sugestões". */
    label?: string;
}
/** Atalhos em pílula para o próximo passo da aula: continuar, outro exemplo, não entendi, me testar. */
export declare function SuggestionChips(props: SuggestionChipsProps): React.JSX.Element;
export interface AskBarProps {
    value?: string;
    defaultValue?: string;
    onChange?: (value: string) => void;
    /** Enter envia; Shift+Enter quebra a linha. */
    onSend?: (value: string) => void;
    placeholder?: string;
    /** Enquanto o tutor escreve: troca Enviar por Parar. */
    generating?: boolean;
    onStop?: () => void;
    /** Mostra o clipe para anexar PDF ou código no meio da aula. */
    onAttach?: () => void;
    attachments?: FileItem[];
    onRemoveAttachment?: (file: FileItem, index: number) => void;
    /** Atalhos acima do campo ("Continuar", "Outro exemplo"…). */
    suggestions?: Suggestion[];
    onSuggestion?: (value: string) => void;
    /** Mostra "Encerrar aula" (gera o resumo). */
    onEnd?: () => void;
    endLabel?: string;
    /** Linha de ajuda abaixo. false esconde. */
    hint?: React.ReactNode | false;
    disabled?: boolean;
    /** Linhas máximas antes de rolar. Padrão 6. */
    maxRows?: number;
    /** Nome acessível do campo. */
    label?: string;
    className?: string;
}
/**
 * A barra fixa no pé da aula: atalhos, campo para responder ou perguntar e a tecla âmbar de enviar.
 * Não é um chat: o que você manda vira uma nota na página e o tutor continua a aula a partir dela.
 */
export declare function AskBar(props: AskBarProps): React.JSX.Element;
export interface SelectionAction {
    label: string;
    icon?: IconName;
    onClick?: () => void;
}
export interface SelectionMenuProps extends React.HTMLAttributes<HTMLDivElement> {
    actions: SelectionAction[];
    /** Nome acessível. Padrão "Ações do trecho selecionado". */
    label?: string;
}
/** Barra flutuante que aparece sobre um trecho selecionado: reexplicar, pedir exemplo, anotar no caderno. Quem usa posiciona. */
export declare function SelectionMenu(props: SelectionMenuProps): React.JSX.Element;
export interface SummaryCardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
    /** Nome do arquivo de resumo ("Aula 03 — Derivadas"). */
    title: React.ReactNode;
    /** Linha pequena acima. Padrão "Resumo gerado". */
    kicker?: React.ReactNode;
    /** Leituras curtas (blocos, questões, score). */
    stats?: {
        label: React.ReactNode;
        value: React.ReactNode;
        unit?: React.ReactNode;
    }[];
    onOpen?: () => void;
    onDownload?: () => void;
    openLabel?: string;
    downloadLabel?: string;
    /** Ideograma do bloco. Padrão 復習 (revisão). */
    glyph?: OrnamentGlyph;
}
/** O arquivo de resumo gerado no fim da aula, para revisar depois: bloco musgo com ideograma, leituras e as ações abrir/baixar. */
export declare function SummaryCard(props: SummaryCardProps): React.JSX.Element;
export interface RulerItem {
    id: string;
    label: string;
}
export interface SectionRulerProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onSelect'> {
    items: RulerItem[];
    /** id do bloco em leitura. */
    current?: string;
    onSelect?: (id: string) => void;
    /** Nome acessível. Padrão "Blocos da aula". */
    label?: string;
}
/** Régua na margem da aula: um traço por bloco; o atual é mais longo e âmbar. Mostra onde você está e leva até o bloco. */
export declare function SectionRuler(props: SectionRulerProps): React.JSX.Element;

/* ───── quiz ───── */
export type QuizResult = 'correct' | 'incorrect' | 'partial' | 'skipped' | null | undefined;
export interface QuizProgressProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'results'> {
    /** Número de questões. */
    total: number;
    /** Questão atual, começando em 1. */
    current: number;
    /** Resultado de cada questão já respondida (índice 0 = questão 1). */
    results?: QuizResult[];
    /** Tempo decorrido ou restante ("02:47"). */
    time?: string;
    /** Rótulo à esquerda. Padrão "Questão". */
    label?: string;
}
/** Placar do questionário: "03/10", tempo e uma fileira de blocos tipo LED — sálvia acertou, tijolo errou, âmbar é a atual. */
export declare function QuizProgress(props: QuizProgressProps): React.JSX.Element;
export interface QuizOption {
    id: string;
    label: React.ReactNode;
}
export interface QuizQuestionProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onChange'> {
    /** Número da questão (vira "03" em letra de pôster). */
    number?: number;
    total?: number;
    /** Legenda acima do enunciado ("Módulo 03 · Derivadas"). */
    kicker?: React.ReactNode;
    /** Enunciado. */
    prompt: React.ReactNode;
    options: QuizOption[];
    /** id da alternativa escolhida. */
    value?: string | null;
    onChange?: (id: string) => void;
    /** Quando definido, revela o gabarito: a certa fica sálvia, a escolhida errada fica tijolo. Sem ele, serve para enquetes (ex.: perfil de aprendizado). */
    correctId?: string;
    disabled?: boolean;
}
/**
 * Questão de alternativas. Cada alternativa é uma tecla com a letra (A, B, C…) — o teclado também responde:
 * a letra escolhe, setas navegam. Com correctId, mostra certo/errado com ícone e palavra, nunca só cor.
 */
export declare function QuizQuestion(props: QuizQuestionProps): React.JSX.Element;
export interface EssayAnswerProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onChange' | 'onSubmit'> {
    number?: number;
    total?: number;
    kicker?: React.ReactNode;
    prompt: React.ReactNode;
    value?: string;
    defaultValue?: string;
    onChange?: (value: string) => void;
    onSubmit?: (value: string) => void;
    /** Mostra "Corrigindo…" e trava o envio. */
    submitting?: boolean;
    /** Mínimo de caracteres para liberar o envio. */
    minLength?: number;
    maxLength?: number;
    placeholder?: string;
    /** Dica sob o campo. */
    hint?: React.ReactNode;
    /** Rótulo do botão. Padrão "Enviar resposta". */
    submitLabel?: string;
    disabled?: boolean;
}
/** Questão dissertativa: enunciado, campo grande com contador e o botão de enviar para correção. */
export declare function EssayAnswer(props: EssayAnswerProps): React.JSX.Element;
export interface QuizCriterion {
    label: React.ReactNode;
    met: boolean;
}
export interface QuizFeedbackProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
    /** correct = sálvia · incorrect = tijolo · partial = creme (dissertativa com nota parcial). */
    status: 'correct' | 'incorrect' | 'partial';
    /** Título na faixa. Padrão "Correta" / "Ainda não" / "Quase lá". */
    title?: React.ReactNode;
    /** Nota em letra de painel ("7,5/10"). */
    score?: React.ReactNode;
    /** Critérios da correção, cada um atendido ou não. */
    criteria?: QuizCriterion[];
    /** Botões (Próxima, Reexplicar…). */
    actions?: React.ReactNode;
}
/** Retorno depois de responder: faixa colorida com ícone e palavra, explicação do tutor, critérios e próximos passos. */
export declare function QuizFeedback(props: QuizFeedbackProps): React.JSX.Element;

/* ───── overlay ───── */
export interface ModalProps {
    open: boolean;
    /** Fechar: botão ×, Esc e clique no véu (se dismissible). */
    onClose?: () => void;
    title: React.ReactNode;
    /** Legenda acima do título ("Novo curso · etapa 2 de 4"). */
    kicker?: React.ReactNode;
    /** sm 440px · md 640px (padrão) · lg 880px. */
    size?: 'sm' | 'md' | 'lg';
    /** Cor da faixa do cabeçalho. Padrão amber. brick só para confirmações destrutivas. */
    tone?: 'panel' | Tone;
    children?: React.ReactNode;
    /** Botões do rodapé, alinhados à direita (primário por último). */
    footer?: React.ReactNode;
    /** Rótulo do botão fechar. Padrão "Fechar". */
    closeLabel?: string;
    /** Esc e clique fora fecham. Padrão true. */
    dismissible?: boolean;
    /** Renderiza em document.body. Padrão true. */
    portal?: boolean;
    className?: string;
}
/**
 * Janela sobre um véu escuro, com faixa de cabeçalho chapada, como uma ficha técnica.
 * Prende o foco, fecha com Esc e devolve o foco a quem abriu.
 */
export declare function Modal(props: ModalProps): React.JSX.Element | null;
export type StepItem = string | {
    label: string;
    description?: string;
};
export interface StepperProps extends React.HTMLAttributes<HTMLOListElement> {
    steps: StepItem[];
    /** Etapa atual, começando em 0. */
    current: number;
    /** Permite voltar clicando numa etapa já feita. */
    onStepClick?: (index: number) => void;
}
/** Trilho de etapas numeradas (01 → 04) para guias em modal, como a criação de curso. Feita = sálvia com visto; atual = âmbar. */
export declare function Stepper(props: StepperProps): React.JSX.Element;

/* ───── data ───── */
export interface MeterItem {
    /** Rótulo curto sob a barra, que se explica sozinho ("01", "Seg", "Prática"). Nada de siglas. */
    label: string;
    /** 0 a 1. */
    value: number;
    /** Nome completo para leitor de tela ("Módulo 01 · Limites"). */
    title?: string;
}
export interface MeterProps extends React.HTMLAttributes<HTMLElement> {
    items: MeterItem[];
    /** Altura das barras em px. Padrão 96. */
    height?: number;
    /** Cor do preenchimento. ink = cor do texto (use sobre cards coloridos). Padrão sage. */
    tone?: 'sage' | 'amber' | 'brick' | 'cream' | 'steel' | 'ink';
    /** Legenda acima, dizendo o que as barras medem ("Progresso por módulo"). */
    label?: React.ReactNode;
    /** Mostra o número (0–100) em cima de cada barra. */
    showValues?: boolean;
}
/** Medidor de barras verticais contornadas, como os medidores de um sintetizador antigo: progresso por módulo, questões por dia, urgência de revisão. */
export declare function Meter(props: MeterProps): React.JSX.Element;
export interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
    /** O número. */
    value: string | number;
    /** Legenda em letra de painel. */
    label?: React.ReactNode;
    /** Sufixo pequeno no alto ("%", "/100", "pts"). */
    suffix?: React.ReactNode;
    /** Pinta o último caractere de tijolo. Só sobre fundos escuros ou cream. */
    accent?: boolean;
    /** Só no poster: xl = 96px (padrão) · lg = 56px. */
    size?: 'lg' | 'xl';
    /**
     * poster (padrão) = Unbounded gigante, o número-pôster da tela.
     * figure = leitura de painel em IBM Plex Mono (data-xl, 56px), com o sufixo na metade do tamanho:
     * a porcentagem de conclusão e a nota dentro de cards e caixas.
     */
    variant?: 'poster' | 'figure';
}
/** Número grande com legenda. poster: nota final, dias seguidos (um por tela). figure: porcentagem de conclusão e nota dentro de cards. */
export declare function Stat(props: StatProps): React.JSX.Element;
export interface SpecBoxProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
    /** Texto à esquerda do cabeçalho ("MOD-03"). */
    title?: React.ReactNode;
    /** Texto à direita do cabeçalho ("Derivadas"). */
    code?: React.ReactNode;
}
/** Caixa técnica de traço grosso, como numa ficha de máquina: cabeçalho opcional separado por filete e o conteúdo (Readout, Meter). Herda a cor do card. */
export declare function SpecBox(props: SpecBoxProps): React.JSX.Element;
export interface ReadoutProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Legenda à esquerda, até duas linhas ("Questões restantes"). */
    label: React.ReactNode;
    value: React.ReactNode;
    /** Unidade depois do valor ("s", "min"). */
    unit?: React.ReactNode;
}
/** Leitura técnica: legenda de painel ao lado de um valor numa caixa contornada, como "ROUNDS REMAINING [571]". Herda a cor do card. */
export declare function Readout(props: ReadoutProps): React.JSX.Element;

declare global {
  interface Window {
    Aprndr: {
      AskBar: typeof AskBar;
      BLOCK_ICONS: typeof BLOCK_ICONS;
      Button: typeof Button;
      CALLOUT_ACTIONS: typeof CALLOUT_ACTIONS;
      CREATE_ID: typeof CREATE_ID;
      Callout: typeof Callout;
      Card: typeof Card;
      Checkbox: typeof Checkbox;
      CourseBar: typeof CourseBar;
      EmptyState: typeof EmptyState;
      EssayAnswer: typeof EssayAnswer;
      FileDrop: typeof FileDrop;
      FileRow: typeof FileRow;
      ICONS: typeof ICONS;
      ICON_NAMES: typeof ICON_NAMES;
      Icon: typeof Icon;
      LessonBlock: typeof LessonBlock;
      Meter: typeof Meter;
      Modal: typeof Modal;
      ModuleCard: typeof ModuleCard;
      NotebookCover: typeof NotebookCover;
      ORNAMENT_MEANINGS: typeof ORNAMENT_MEANINGS;
      Ornament: typeof Ornament;
      ProgressTrack: typeof ProgressTrack;
      Prose: typeof Prose;
      QuizFeedback: typeof QuizFeedback;
      QuizProgress: typeof QuizProgress;
      QuizQuestion: typeof QuizQuestion;
      RadioGroup: typeof RadioGroup;
      Readout: typeof Readout;
      SectionRuler: typeof SectionRuler;
      Select: typeof Select;
      SelectionMenu: typeof SelectionMenu;
      SpecBox: typeof SpecBox;
      Stat: typeof Stat;
      Stepper: typeof Stepper;
      Sticker: typeof Sticker;
      StudentNote: typeof StudentNote;
      SubjectWheel: typeof SubjectWheel;
      SuggestionChips: typeof SuggestionChips;
      SummaryCard: typeof SummaryCard;
      Switch: typeof Switch;
      Tag: typeof Tag;
      TextArea: typeof TextArea;
      TextField: typeof TextField;
      Wordmark: typeof Wordmark;
      cx: typeof cx;
      formatBytes: typeof formatBytes;
      letter: typeof letter;
      pad2: typeof pad2;
    };
  }
}
