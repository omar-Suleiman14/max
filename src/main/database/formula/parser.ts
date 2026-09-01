import { tokenize, type Token, type TokenType } from './tokenizer';

export type FormulaNode =
  | Readonly<{ kind: 'literal'; value: boolean | number | string | null }>
  | Readonly<{ kind: 'property_ref'; propertyId: string }>
  | Readonly<{ argument: FormulaNode; kind: 'unary_op'; operator: '!' | '-' | 'not' }>
  | Readonly<{ kind: 'binary_op'; left: FormulaNode; operator: string; right: FormulaNode }>
  | Readonly<{ args: readonly FormulaNode[]; kind: 'function_call'; name: string }>;

const PRECEDENCE: Partial<Record<TokenType, number>> = {
  OR: 1,
  AND: 2,
  EQ: 3,
  NEQ: 3,
  GT: 4,
  GTE: 4,
  LT: 4,
  LTE: 4,
  MINUS: 5,
  PLUS: 5,
  PERCENT: 6,
  SLASH: 6,
  STAR: 6,
};

export class FormulaParser {
  #tokens: readonly Token[] = [];
  #current = 0;

  parse(expression: string): FormulaNode {
    this.#tokens = tokenize(expression);
    this.#current = 0;

    if (this.#peek().type === 'EOF') {
      return { kind: 'literal', value: null };
    }

    const node = this.#parseExpression(0);
    if (this.#peek().type !== 'EOF') {
      throw new Error(`Unexpected token '${this.#peek().value}' at position ${this.#peek().position}`);
    }
    return node;
  }

  #parseExpression(minPrecedence: number): FormulaNode {
    let left = this.#parsePrefix();

    while (true) {
      const token = this.#peek();
      const prec = PRECEDENCE[token.type];
      if (prec === undefined || prec < minPrecedence) {
        break;
      }

      this.#advance();
      const operator = token.value.toLowerCase();
      const right = this.#parseExpression(prec + 1);
      left = {
        kind: 'binary_op',
        left,
        operator,
        right,
      };
    }

    return left;
  }

  #parsePrefix(): FormulaNode {
    const token = this.#advance();

    switch (token.type) {
      case 'NUMBER':
        return { kind: 'literal', value: Number(token.value) };
      case 'STRING':
        return { kind: 'literal', value: token.value };
      case 'BOOLEAN':
        return { kind: 'literal', value: token.value === 'true' };
      case 'NULL':
        return { kind: 'literal', value: null };
      case 'MINUS':
      case 'NOT': {
        const op = token.value.toLowerCase() as '!' | '-' | 'not';
        const arg = this.#parseExpression(7);
        return { argument: arg, kind: 'unary_op', operator: op };
      }
      case 'LPAREN': {
        const expr = this.#parseExpression(0);
        this.#consume('RPAREN', "Expected ')' after expression.");
        return expr;
      }
      case 'IDENTIFIER': {
        // Check if function call
        if (this.#peek().type === 'LPAREN') {
          this.#advance(); // consume '('
          const args: FormulaNode[] = [];
          if (this.#peek().type !== 'RPAREN') {
            while (true) {
              args.push(this.#parseExpression(0));
              if (this.#peek().type === 'COMMA') {
                this.#advance();
              } else {
                break;
              }
            }
          }
          this.#consume('RPAREN', `Expected ')' after function arguments for '${token.value}'.`);
          return { args, kind: 'function_call', name: token.value.toLowerCase() };
        }

        // Otherwise it's a property reference
        return { kind: 'property_ref', propertyId: token.value };
      }
      default:
        throw new Error(`Unexpected token '${token.value}' at position ${token.position}`);
    }
  }

  #peek(): Token {
    return this.#tokens[this.#current] ?? { position: 0, type: 'EOF', value: '' };
  }

  #advance(): Token {
    const token = this.#peek();
    if (token.type !== 'EOF') {
      this.#current++;
    }
    return token;
  }

  #consume(type: TokenType, errorMessage: string): Token {
    const token = this.#peek();
    if (token.type !== type) {
      throw new Error(`${errorMessage} Got '${token.value}' at position ${token.position}`);
    }
    return this.#advance();
  }
}
