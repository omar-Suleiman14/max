import { describe, expect, it } from 'vitest';
import { FormulaParser } from './parser';
import { evaluateFormula } from './evaluator';
import { extractFormulaDependencies } from './dependency-extractor';

describe('Formula Engine', () => {
  const parser = new FormulaParser();

  it('evaluates basic arithmetic and comparisons', () => {
    const ast = parser.parse('10 + 20 * 2');
    const result = evaluateFormula(ast, { properties: {} });
    expect(result).toBe(50);

    const cmpAst = parser.parse('50 > 30 && 20 <= 20');
    expect(evaluateFormula(cmpAst, { properties: {} })).toBe(true);
  });

  it('evaluates property references and string functions', () => {
    const ast = parser.parse("concat(upper(prop_name), ' - ', [prop_code])");
    const result = evaluateFormula(ast, {
      properties: {
        prop_code: 'EG-01',
        prop_name: 'cairo',
      },
    });
    expect(result).toBe('CAIRO - EG-01');

    const deps = extractFormulaDependencies(ast);
    expect(deps).toEqual(['prop_name', 'prop_code']);
  });

  it('evaluates conditional if statements and round/min/max', () => {
    const ast = parser.parse('if(price > 100, round(price * 0.9, 2), price)');
    const res1 = evaluateFormula(ast, { properties: { price: 150.555 } });
    expect(res1).toBe(135.5);

    const res2 = evaluateFormula(ast, { properties: { price: 80 } });
    expect(res2).toBe(80);
  });

  it('evaluates date calculations', () => {
    const ast = parser.parse("year('2026-08-31')");
    expect(evaluateFormula(ast, { properties: {} })).toBe(2026);

    const addAst = parser.parse("dateAdd('2026-08-31', 5, 'day')");
    const res = evaluateFormula(addAst, { properties: {} }) as string;
    expect(res.slice(0, 10)).toBe('2026-09-05');
  });
});
