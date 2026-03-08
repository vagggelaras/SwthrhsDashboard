import { formulaToDisplayParts } from '../lib/formula'
import './FormulaBuilder.css'

const OPS = ['+', '-', '*', '/']
const OP_LABELS = { '+': '+', '-': '−', '*': '×', '/': '÷' }

const emptyFormula = {
  base_type: 'variable',
  base_value: '',
  steps: []
}

function ValuePicker({ type, value, onTypeChange, onValueChange, variables }) {
  const varNames = Object.keys(variables)
  return (
    <div className="value-picker">
      <select className="vp-type" value={type} onChange={e => onTypeChange(e.target.value)}>
        <option value="number">Αριθμός</option>
        <option value="variable">Μεταβλητή</option>
      </select>
      {type === 'variable' ? (
        <select className="vp-value" value={value} onChange={e => onValueChange(e.target.value)}>
          <option value="">--</option>
          {varNames.map(v => (
            <option key={v} value={v}>{v} ({variables[v]})</option>
          ))}
        </select>
      ) : (
        <input
          className="vp-value"
          type="number"
          step="any"
          placeholder="0.00"
          value={value}
          onChange={e => onValueChange(e.target.value)}
        />
      )}
    </div>
  )
}

export default function FormulaBuilder({ formula, onChange, variables }) {
  const f = formula || emptyFormula
  const varNames = Object.keys(variables)

  function setBase(field, value) {
    const updated = { ...f, [field]: value }
    if (field === 'base_type' && value === 'variable' && typeof f.base_value !== 'string') {
      updated.base_value = varNames[0] || ''
    }
    if (field === 'base_type' && value === 'number' && typeof f.base_value === 'string') {
      updated.base_value = ''
    }
    onChange(updated)
  }

  function updateStep(i, updates) {
    const steps = f.steps.map((s, idx) => idx === i ? { ...s, ...updates } : s)
    onChange({ ...f, steps })
  }

  function addStep() {
    onChange({ ...f, steps: [...f.steps, { op: '*', val_type: 'number', val: '' }] })
  }

  function removeStep(i) {
    onChange({ ...f, steps: f.steps.filter((_, idx) => idx !== i) })
  }

  const { text, result } = formulaToDisplayParts(f, variables)
  const hasContent = f.base_value !== '' || f.steps.length > 0

  return (
    <div className="formula-builder">
      {hasContent && (
        <div className="formula-bar">
          <span className="formula-bar-text">{text}</span>
          {result != null && <span className="formula-bar-result">= {result}</span>}
        </div>
      )}

      <div className="fb-row">
        <span className="fb-label">Βάση</span>
        <ValuePicker
          type={f.base_type}
          value={f.base_value}
          onTypeChange={v => setBase('base_type', v)}
          onValueChange={v => setBase('base_value', v)}
          variables={variables}
        />
      </div>

      {f.steps.map((step, i) => (
        <div className="fb-row" key={i}>
          <select
            className="fb-op"
            value={step.op}
            onChange={e => updateStep(i, { op: e.target.value })}
          >
            {OPS.map(op => (
              <option key={op} value={op}>{OP_LABELS[op]}</option>
            ))}
          </select>
          <ValuePicker
            type={step.val_type || 'number'}
            value={step.val}
            onTypeChange={v => {
              const updates = { val_type: v }
              if (v === 'variable' && typeof step.val !== 'string') updates.val = varNames[0] || ''
              if (v === 'number' && typeof step.val === 'string') updates.val = ''
              updateStep(i, updates)
            }}
            onValueChange={v => updateStep(i, { val: v })}
            variables={variables}
          />
          <button type="button" className="btn-step-remove" onClick={() => removeStep(i)}>×</button>
        </div>
      ))}

      <button type="button" className="btn-step-add" onClick={addStep}>+ Βήμα</button>
    </div>
  )
}
