/**
 * Slash command parser for ChUB 2000 Web.
 * Matches the original VB6 chat parser syntax.
 */

const BUILT_IN_COMMANDS = new Set([
  'block', 'rest', 'taunt', 'divert', 'moves', 'status', 'get', 'flee', 'defect'
]);

const INFO_COMMANDS = new Set(['moves', 'status']);

/**
 * Parse a slash/tilde command from raw player input.
 * @param {string} input - Raw text string from the player.
 * @returns {object} Parsed command object.
 */
export function parseCommand(input) {
  if (typeof input !== 'string') {
    return { type: 'unknown', raw: input };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { type: 'unknown', raw: input };
  }

  // Host commands: ~prefix
  if (trimmed.startsWith('~')) {
    return parseHostCommand(trimmed);
  }

  // Slash commands: /prefix
  if (trimmed.startsWith('/')) {
    return parseSlashCommand(trimmed);
  }

  return { type: 'unknown', raw: input };
}

function parseHostCommand(trimmed) {
  const body = trimmed.slice(1).trim();
  const parts = body.split(/\s+/);
  const command = parts[0]?.toLowerCase();

  if (!command) {
    return { type: 'unknown', raw: trimmed };
  }

  const result = { type: 'host', command };
  if (parts.length > 1) {
    result.target = parts[1];
  }
  return result;
}

function parseSlashCommand(trimmed) {
  const body = trimmed.slice(1);
  const parts = body.trim().split(/\s+/);
  let keyword = parts[0]?.toLowerCase() ?? '';
  const rest = parts.slice(1);

  // Check for super prefix: /s-move or /N-move (N = 2-5)
  let isSuper = false;
  let superLevel = 0;

  const superMatch = keyword.match(/^(s|[2-5])-(.+)$/);
  if (superMatch) {
    isSuper = true;
    superLevel = superMatch[1] === 's' ? 1 : Number(superMatch[1]);
    keyword = superMatch[2];
  }

  // Move by number: /1 through /12
  const numberMatch = keyword.match(/^(\d+)$/);
  if (numberMatch) {
    const num = Number(numberMatch[1]);
    if (num >= 1 && num <= 12 && !isSuper) {
      return {
        type: 'moveByNumber',
        number: num,
        target: rest[0] || undefined,
        isSuper: false
      };
    }
  }

  // Built-in commands (no super prefix allowed on these)
  if (BUILT_IN_COMMANDS.has(keyword) && !isSuper) {
    return parseBuiltIn(keyword, rest, trimmed);
  }

  // Otherwise it's a move select or move command
  if (!keyword) {
    return { type: 'unknown', raw: trimmed };
  }

  // If there's a target, it's a move command
  if (rest.length > 0 || isSuper) {
    return {
      type: 'move',
      key: keyword,
      target: rest[0] || undefined,
      isSuper,
      ...(isSuper ? { superLevel } : {})
    };
  }

  // No target, no super — select command
  return { type: 'select', key: keyword };
}

function parseBuiltIn(keyword, rest, raw) {
  switch (keyword) {
    case 'block': {
      const result = { type: 'block' };
      if (rest.length > 0) {
        result.counterMove = rest[0].toLowerCase();
      }
      return result;
    }
    case 'rest':
      return { type: 'rest' };
    case 'taunt':
      return { type: 'taunt' };
    case 'divert': {
      const amount = Number(rest[0]);
      return { type: 'divert', amount: isNaN(amount) ? undefined : amount };
    }
    case 'moves':
    case 'status':
      return { type: 'info', subtype: keyword };
    case 'get':
      return { type: 'get' };
    case 'flee':
      return { type: 'flee' };
    case 'defect':
      return { type: 'defect', target: rest[0] || undefined };
    default:
      return { type: 'unknown', raw };
  }
}
