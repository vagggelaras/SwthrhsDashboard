/**
 * Formula shape:
 * {
 *   base_type: "variable" | "number",
 *   base_value: "wholesale_price" | 0.05,
 *   steps: [
 *     { op: "+"|"-"|"*"|"/", val_type: "number"|"variable", val: 1.2 | "adjustment_factor" }
 *   ]
 * }
 */

function resolveValue(type, val, variables) {
  if (type === 'variable') return Number(variables[val] ?? 0)
  return Number(val ?? 0)
}

function formatValue(type, val, variables) {
  if (type === 'variable') {
    const resolved = variables[val]
    return resolved != null ? `${val}(${resolved})` : val
  }
  return val != null && val !== '' ? String(val) : '?'
}

export function evaluateFormula(formula, variables = {}) {
  if (!formula) return null

  let result = resolveValue(formula.base_type, formula.base_value, variables)

  for (const step of formula.steps || []) {
    const val = resolveValue(step.val_type || 'number', step.val, variables)
    switch (step.op) {
      case '+': result += val; break
      case '-': result -= val; break
      case '*': result *= val; break
      case '/': result = val !== 0 ? result / val : result; break
    }
  }

  return Math.round(result * 100000) / 100000
}

export function formulaToDisplayParts(formula, variables = {}) {
  if (!formula) return { text: '', result: null }

  const parts = [formatValue(formula.base_type, formula.base_value, variables)]

  for (const step of formula.steps || []) {
    const opSymbol = { '+': '+', '-': '−', '*': '×', '/': '÷' }[step.op] || step.op
    parts.push(opSymbol)
    parts.push(formatValue(step.val_type || 'number', step.val, variables))
  }

  const result = evaluateFormula(formula, variables)
  return { text: parts.join(' '), result }
}
