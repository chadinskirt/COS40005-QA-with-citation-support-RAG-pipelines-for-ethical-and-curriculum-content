import Icon from './Icon.jsx';

// Figma: MajorChip
export function MajorChip({ selected, children, ...rest }) {
  return (
    <button type="button" className="major-chip" aria-pressed={selected} {...rest}>
      {selected && <Icon name="check" size={16} />}
      {children}
    </button>
  );
}

// "doc · section · p.6". Screen readers get pageWord="page ".
export function citationSource(c, pageWord = 'p.') {
  return [c.doc, c.section, c.page != null ? `${pageWord}${c.page}` : null].filter(Boolean).join(' · ');
}

// Figma: CitationChip. Label: [n] doc · section · page
export function CitationChip({ citation, index, selected, onSelect }) {
  return (
    <button
      type="button"
      className="cite-chip"
      aria-pressed={Boolean(selected)}
      aria-label={`Source ${index}: ${citationSource(citation, 'page ')}`}
      onClick={onSelect}
    >
      <Icon name="file" size={14} />[{index}] {citationSource(citation)}
    </button>
  );
}
