import { normalizeTerm, type PromptTerm } from './terms';

export interface TranslatedPart {
  source: string;
  text: string;
  missing: boolean;
}

// 先按完整词句查词库，再递归处理括号和权重，避免把半个英文单词当成词条。
export function translateFromLibrary(value: string, terms: PromptTerm[]): TranslatedPart[] {
  const dictionary = new Map(
    terms.filter((term) => term.enabled).map((term) => [normalizeTerm(term.text), term.translation]),
  );
  const translate = (source: string, nesting = 0): TranslatedPart[] => {
    const trimmed = source.trim();
    if (!trimmed) return [];
    if (nesting > 24) return [{ source: trimmed, text: trimmed, missing: true }];
    const exact = dictionary.get(normalizeTerm(trimmed));
    if (exact) return [{ source: trimmed, text: exact, missing: false }];
    if (/^<[^<>]+>$/.test(trimmed) || trimmed === 'BREAK' || /^[\d.\s:+-]+$/.test(trimmed)) {
      return [{ source: trimmed, text: trimmed, missing: false }];
    }
    let bracketDepth = 0;
    const enclosed = [...trimmed].every((char, index) => {
      if (char === '(' || char === '[') bracketDepth++;
      if (char === ')' || char === ']') bracketDepth--;
      return bracketDepth > 0 || index === trimmed.length - 1;
    });
    if (
      enclosed &&
      ((trimmed.startsWith('(') && trimmed.endsWith(')')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']')))
    ) {
      const inner = trimmed.slice(1, -1);
      const weight = inner.match(/(:-?\d+(?:\.\d+)?)$/)?.[0] ?? '';
      return [
        { source: '', text: trimmed[0], missing: false },
        ...translate(inner.slice(0, inner.length - weight.length), nesting + 1),
        { source: '', text: weight + trimmed[trimmed.length - 1], missing: false },
      ];
    }
    let depth = 0;
    let angle = false;
    let start = 0;
    const pieces: string[] = [];
    for (let index = 0; index < trimmed.length; index++) {
      const char = trimmed[index];
      if (char === '<') angle = true;
      else if (char === '>') angle = false;
      else if (!angle && (char === '(' || char === '[')) depth++;
      else if (!angle && (char === ')' || char === ']')) depth = Math.max(0, depth - 1);
      if (!angle && depth === 0 && /[,，;；\n]/.test(char)) {
        pieces.push(trimmed.slice(start, index));
        start = index + 1;
      }
    }
    if (pieces.length) {
      pieces.push(trimmed.slice(start));
      return pieces
        .filter((piece) => piece.trim())
        .flatMap((piece, index) => [
          ...(index ? [{ source: '', text: '，', missing: false }] : []),
          ...translate(piece, nesting + 1),
        ]);
    }
    return [{ source: trimmed, text: trimmed, missing: true }];
  };
  return translate(value);
}
