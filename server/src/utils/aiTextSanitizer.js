

// Reasoning wrappers some models emit inline with the answer
const CLOSED_BLOCK = /<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi;
// Reply cut off mid-thought: the opening tag never closes
const UNCLOSED_BLOCK = /<(?:think|thinking|reasoning)>[\s\S]*$/i;
// Some providers drop the opening tag but keep the closing one
const ORPHAN_CLOSER = /^[\s\S]*<\/(?:think|thinking|reasoning)>/i;

// Safety-classifier labels, e.g. `User Safety: safe` / `Response Safety: safe`,
// on separate lines, side by side, or as a one-line JSON object
const SAFETY_LABELS = /^[ \t]*(?:"?(?:User|Response)[ \t]*Safety"?[ \t]*[:=][ \t]*"?\w+"?[,;]?[ \t]*)+$/gim;
const SAFETY_JSON_LINE = /^[ \t]*\{[^{}\n]*"(?:User|Response)[ \t]*Safety"[^{}\n]*\}[ \t]*$/gim;

export const stripReasoningArtifacts = (text) => {
  if (!text) return '';

  return text
    .replace(CLOSED_BLOCK, '')
    .replace(UNCLOSED_BLOCK, '')
    .replace(ORPHAN_CLOSER, '')
    .replace(SAFETY_JSON_LINE, '')
    .replace(SAFETY_LABELS, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};