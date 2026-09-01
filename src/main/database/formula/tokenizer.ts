export type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'NULL'
  | 'IDENTIFIER'
  | 'PLUS'
  | 'MINUS'
  | 'STAR'
  | 'SLASH'
  | 'PERCENT'
  | 'EQ'
  | 'NEQ'
  | 'LT'
  | 'LTE'
  | 'GT'
  | 'GTE'
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'EOF';

export type Token = Readonly<{
  position: number;
  type: TokenType;
  value: string;
}>;

export function tokenize(input: string): readonly Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < input.length) {
    const char = input[pos];
    if (!char) {
      break;
    }

    if (/\s/.test(char)) {
      pos++;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(char)) {
      let numStr = '';
      const startPos = pos;
      while (pos < input.length && /[0-9.]/.test(input[pos] ?? '')) {
        numStr += input[pos++];
      }
      tokens.push({ position: startPos, type: 'NUMBER', value: numStr });
      continue;
    }

    // Strings: single or double quoted
    if (char === '"' || char === "'") {
      const quote = char;
      let str = '';
      const startPos = pos++;
      while (pos < input.length && input[pos] !== quote) {
        if (input[pos] === '\\' && pos + 1 < input.length) {
          pos++;
        }
        str += input[pos++];
      }
      if (pos < input.length && input[pos] === quote) {
        pos++;
      }
      tokens.push({ position: startPos, type: 'STRING', value: str });
      continue;
    }

    // Identifiers or keywords: [prop_123] or prop_123 or function name
    if (char === '[') {
      const startPos = pos++;
      let ident = '';
      while (pos < input.length && input[pos] !== ']') {
        ident += input[pos++];
      }
      if (pos < input.length && input[pos] === ']') {
        pos++;
      }
      tokens.push({ position: startPos, type: 'IDENTIFIER', value: ident.trim() });
      continue;
    }

    if (/[a-zA-Z_]/.test(char)) {
      let ident = '';
      const startPos = pos;
      while (pos < input.length && /[a-zA-Z0-9_-]/.test(input[pos] ?? '')) {
        ident += input[pos++];
      }
      const lower = ident.toLowerCase();
      if (lower === 'true' || lower === 'false') {
        tokens.push({ position: startPos, type: 'BOOLEAN', value: lower });
      } else if (lower === 'null') {
        tokens.push({ position: startPos, type: 'NULL', value: 'null' });
      } else if (lower === 'and') {
        tokens.push({ position: startPos, type: 'AND', value: 'and' });
      } else if (lower === 'or') {
        tokens.push({ position: startPos, type: 'OR', value: 'or' });
      } else if (lower === 'not') {
        tokens.push({ position: startPos, type: 'NOT', value: 'not' });
      } else {
        tokens.push({ position: startPos, type: 'IDENTIFIER', value: ident });
      }
      continue;
    }

    // Multi-char operators
    if (char === '=' && input[pos + 1] === '=') {
      tokens.push({ position: pos, type: 'EQ', value: '==' });
      pos += 2;
      continue;
    }
    if (char === '!' && input[pos + 1] === '=') {
      tokens.push({ position: pos, type: 'NEQ', value: '!=' });
      pos += 2;
      continue;
    }
    if (char === '<' && input[pos + 1] === '=') {
      tokens.push({ position: pos, type: 'LTE', value: '<=' });
      pos += 2;
      continue;
    }
    if (char === '>' && input[pos + 1] === '=') {
      tokens.push({ position: pos, type: 'GTE', value: '>=' });
      pos += 2;
      continue;
    }
    if (char === '&' && input[pos + 1] === '&') {
      tokens.push({ position: pos, type: 'AND', value: '&&' });
      pos += 2;
      continue;
    }
    if (char === '|' && input[pos + 1] === '|') {
      tokens.push({ position: pos, type: 'OR', value: '||' });
      pos += 2;
      continue;
    }

    // Single-char operators
    switch (char) {
      case '+':
        tokens.push({ position: pos++, type: 'PLUS', value: '+' });
        break;
      case '-':
        tokens.push({ position: pos++, type: 'MINUS', value: '-' });
        break;
      case '*':
        tokens.push({ position: pos++, type: 'STAR', value: '*' });
        break;
      case '/':
        tokens.push({ position: pos++, type: 'SLASH', value: '/' });
        break;
      case '%':
        tokens.push({ position: pos++, type: 'PERCENT', value: '%' });
        break;
      case '=':
        tokens.push({ position: pos++, type: 'EQ', value: '=' });
        break;
      case '<':
        tokens.push({ position: pos++, type: 'LT', value: '<' });
        break;
      case '>':
        tokens.push({ position: pos++, type: 'GT', value: '>' });
        break;
      case '!':
        tokens.push({ position: pos++, type: 'NOT', value: '!' });
        break;
      case '(':
        tokens.push({ position: pos++, type: 'LPAREN', value: '(' });
        break;
      case ')':
        tokens.push({ position: pos++, type: 'RPAREN', value: ')' });
        break;
      case ',':
        tokens.push({ position: pos++, type: 'COMMA', value: ',' });
        break;
      default:
        throw new Error(`Unexpected character in formula: '${char}' at position ${pos}`);
    }
  }

  tokens.push({ position: pos, type: 'EOF', value: '' });
  return tokens;
}
