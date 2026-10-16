/*
 * APRNDR — componentes React (18+).
 * Estilos: tokens.css (gerado de tokens.json) + components/bundle.css. Classes com prefixo `ap-`.
 * No bundle (components/bundle.js) tudo isto vive em window.Aprndr.
 */
export { cx, pad2, letter } from './util';
export type { Tone } from './util';

export { Icon, ICONS, ICON_NAMES } from './icons';
export type { IconName, IconProps } from './icons';

export { Wordmark, Ornament, ORNAMENT_MEANINGS, Sticker, Button, Tag, Card, Callout, CALLOUT_ACTIONS, Prose, EmptyState } from './base';
export type { WordmarkProps, OrnamentGlyph, OrnamentProps, StickerProps, ButtonProps, TagProps, CardProps, CalloutAction, CalloutProps, ProseProps, EmptyStateProps } from './base';

export { NotebookCover, SubjectWheel, CREATE_ID, ProgressTrack, CourseBar, ModuleCard } from './nav';
export type { NotebookCoverProps, SubjectItem, SubjectWheelProps, TrackKind, TrackState, TrackStep, ProgressTrackProps, CourseBarProps, ModuleState, ModuleReading, ModuleCardProps } from './nav';

export { TextField, TextArea, Select, Checkbox, RadioGroup, Switch, FileDrop, FileRow, formatBytes } from './forms';
export type { TextFieldProps, TextAreaProps, SelectOption, SelectProps, CheckboxProps, RadioOption, RadioGroupProps, SwitchProps, FileItem, FileDropProps } from './forms';

export { LessonBlock, BLOCK_ICONS, StudentNote, AskBar, SuggestionChips, SelectionMenu, SummaryCard, SectionRuler } from './lesson';
export type { LessonBlockProps, StudentNoteProps, AskBarProps, Suggestion, SuggestionChipsProps, SelectionAction, SelectionMenuProps, SummaryCardProps, RulerItem, SectionRulerProps } from './lesson';

export { QuizProgress, QuizQuestion, EssayAnswer, QuizFeedback } from './quiz';
export type { QuizResult, QuizProgressProps, QuizOption, QuizQuestionProps, EssayAnswerProps, QuizCriterion, QuizFeedbackProps } from './quiz';

export { Modal, Stepper } from './overlay';
export type { ModalProps, StepItem, StepperProps } from './overlay';

export { Meter, Stat, Readout, SpecBox } from './data';
export type { MeterItem, MeterProps, StatProps, ReadoutProps, SpecBoxProps } from './data';
