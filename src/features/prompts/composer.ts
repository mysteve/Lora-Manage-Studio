export interface PromptSegment {
  id: string;
  name?: string;
  text: string;
  enabled: boolean;
  kind: 'positive' | 'negative';
}
export interface PromptDraft {
  segments: PromptSegment[];
}
export function moveSegment(segments: PromptSegment[], sourceId: string, targetId: string, after: boolean) {
  const source = segments.find((segment) => segment.id === sourceId);
  const target = segments.find((segment) => segment.id === targetId);
  if (!source || !target || sourceId === targetId || source.kind !== target.kind) return segments;
  const reordered = segments.filter((segment) => segment.id !== sourceId);
  const index = reordered.findIndex((segment) => segment.id === targetId);
  reordered.splice(index + (after ? 1 : 0), 0, source);
  return reordered;
}
export function composePrompt(draft: PromptDraft) {
  const join = (kind: PromptSegment['kind']) =>
    draft.segments
      .filter((segment) => segment.enabled && segment.kind === kind)
      // 统一片段边界的分隔符，保留片段内部的标点和权重语法。
      .map((segment) => segment.text.replace(/^[\s,，]+|[\s,，]+$/g, ''))
      .filter(Boolean)
      .join(', ');
  return { positive: join('positive'), negative: join('negative') };
}
