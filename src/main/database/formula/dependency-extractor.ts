import type { FormulaNode } from './parser';

export function extractFormulaDependencies(node: FormulaNode): readonly string[] {
  const propertyIds = new Set<string>();

  function traverse(current: FormulaNode): void {
    switch (current.kind) {
      case 'property_ref':
        propertyIds.add(current.propertyId);
        break;
      case 'unary_op':
        traverse(current.argument);
        break;
      case 'binary_op':
        traverse(current.left);
        traverse(current.right);
        break;
      case 'function_call':
        for (const arg of current.args) {
          traverse(arg);
        }
        break;
      case 'literal':
        break;
    }
  }

  traverse(node);
  return [...propertyIds];
}
