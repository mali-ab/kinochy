/** Accept both legacy PascalCase cues and the current camelCase API shape. */
export function normalizeSubtitleCues(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((cue, index) => ({
      id: Number(cue?.id ?? cue?.Id ?? index + 1),
      start: Number(cue?.start ?? cue?.Start),
      end: Number(cue?.end ?? cue?.End),
      text: String(cue?.text ?? cue?.Text ?? '').trim()
    }))
    .filter((cue) => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.end > cue.start && cue.text)
    .sort((left, right) => left.start - right.start || left.end - right.end);
}
