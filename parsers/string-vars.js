// parsers/string-vars.js
export function substituteVars(template, vars = {}) {
  if (!template) return '';
  return template
    .replace(/%SN/gi, vars.SN ?? '')
    .replace(/%S2/gi, vars.S2 ?? '')
    .replace(/%T/gi, vars.T ?? '')
    .replace(/%Y/gi, vars.Y ?? '');
}

export function stripQuotes(str) {
  if (!str) return '';
  const trimmed = str.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseQuotedString(line) {
  return stripQuotes(line.trim());
}
