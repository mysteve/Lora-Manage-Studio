function normalize(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s._-]+/g, '');
}

export function filterBaseModels(models: string[], query: string): string[] {
  const needle = normalize(query);
  return models.filter((model) => normalize(model).includes(needle));
}
