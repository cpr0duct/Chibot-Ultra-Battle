// parsers/string-vars.js
export function substituteVars(template, vars = {}) {
  if (!template) return '';
  return template
    .replace(/%SN/g, vars.SN ?? '')
    .replace(/%S2/g, vars.S2 ?? '')
    .replace(/%T/g, vars.T ?? '')
    .replace(/%Y/g, vars.Y ?? '');
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
