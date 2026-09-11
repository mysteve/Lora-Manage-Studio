import { builtInTerms, normalizeTerm, type PromptTerm } from './terms';

export type ExternalTermRow = [string, string, string, string, number, string];
export function mergeExternalTerms(rows: ExternalTermRow[]): PromptTerm[] {
  const merged = new Map(builtInTerms.map((term) => [normalizeTerm(term.text), { ...term }]));
  for (const [text, translation, category, aliases, count, source] of rows) {
    const key = normalizeTerm(text);
    const existing = merged.get(key);
    if (existing) {
      existing.aliases = [existing.aliases, aliases].filter(Boolean).join(' ');
      continue;
    }
    merged.set(key, {
      id: `external:${key}`,
      text,
      translation,
      category,
      aliases,
      count,
      source,
      kind: 'both',
      enabled: true,
    });
  }
  return [...merged.values()];
}
let loading: Promise<PromptTerm[]> | undefined;
export function loadPromptVocabulary() {
  loading ??= import('./data/external-terms.json?raw')
    .then((module) => JSON.parse(module.default) as ExternalTermRow[])
    .then(mergeExternalTerms)
    .catch((error) => {
      loading = undefined;
      throw error;
    });
  return loading;
}
