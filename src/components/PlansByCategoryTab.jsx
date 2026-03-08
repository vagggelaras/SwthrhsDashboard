import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { cacheGet, cacheSet, cacheInvalidate } from '../lib/cache'
import { evaluateFormula } from '../lib/formula'
import FormulaBuilder from './FormulaBuilder'
import './PlansByCategoryTab.css'

function TruncateCell({ children }) {
  const [tip, setTip] = useState(null)

  const onEnter = useCallback((e) => {
    const el = e.currentTarget
    if (el.scrollWidth <= el.clientWidth) return
    const rect = el.getBoundingClientRect()
    setTip({ text: el.textContent, x: rect.left, y: rect.bottom + 4 })
  }, [])

  const onLeave = useCallback(() => setTip(null), [])

  return (
    <td className="truncate-cell" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {children}
      {tip && createPortal(
        <div className="instant-tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>,
        document.body
      )}
    </td>
  )
}

const CACHE_KEY_PLANS = 'admin_plans'
const CACHE_KEY_PROVIDERS = 'admin_providers'

const TARIFF_TYPES = [
  'Σταθερό Τιμολόγιο',
  'Κυμαινόμενο Τιμολόγιο',
  'Ειδικό Τιμολόγιο',
  'Δυναμικό Τιμολόγιο'
]

const emptyTier = { min_kwh: '', max_kwh: '', price_per_kwh: '' }

function TierEditor({ tiers, onChange, variables }) {
  function updateTier(i, field, value) {
    const updated = tiers.map((t, idx) =>
      idx === i ? { ...t, [field]: value } : t
    )
    onChange(updated)
  }

  function addTier() {
    onChange([...tiers, { ...emptyTier, price_mode: 'static', formula: null }])
  }

  function removeTier(i) {
    onChange(tiers.filter((_, idx) => idx !== i))
  }

  function toggleTierMode(i) {
    const tier = tiers[i]
    const newMode = tier.price_mode === 'formula' ? 'static' : 'formula'
    const updated = tiers.map((t, idx) =>
      idx === i ? {
        ...t,
        price_mode: newMode,
        formula: newMode === 'formula' ? (t.formula || { base_type: 'variable', base_value: '', steps: [] }) : t.formula
      } : t
    )
    onChange(updated)
  }

  return (
    <div className="tier-editor">
      <div className="tier-header">
        <span className="tier-label">Κλιμάκια τιμολόγησης</span>
        <button type="button" className="btn-tier-add" onClick={addTier}>+ Κλιμάκιο</button>
      </div>
      {tiers.map((tier, i) => (
        <div className="tier-block" key={i}>
          <div className="tier-row">
            <input
              type="number"
              step="any"
              placeholder="Από kWh"
              value={tier.min_kwh}
              onChange={e => updateTier(i, 'min_kwh', e.target.value)}
            />
            <input
              type="number"
              step="any"
              placeholder="Έως kWh"
              value={tier.max_kwh}
              onChange={e => updateTier(i, 'max_kwh', e.target.value)}
            />
            {tier.price_mode !== 'formula' && (
              <input
                type="number"
                step="any"
                placeholder="€/kWh"
                value={tier.price_per_kwh}
                onChange={e => updateTier(i, 'price_per_kwh', e.target.value)}
              />
            )}
            <button
              type="button"
              className={`btn-mode-toggle${tier.price_mode === 'formula' ? ' active' : ''}`}
              onClick={() => toggleTierMode(i)}
              title="Εναλλαγή σταθερή/φόρμουλα"
            >
              fx
            </button>
            <button type="button" className="btn-tier-remove" onClick={() => removeTier(i)}>×</button>
          </div>
          {tier.price_mode === 'formula' && (
            <FormulaBuilder
              formula={tier.formula}
              onChange={f => updateTier(i, 'formula', f)}
              variables={variables}
            />
          )}
        </div>
      ))}
      {tiers.length === 0 && (
        <p className="tier-empty">Χωρίς κλιμάκια — χρησιμοποιείται η ενιαία τιμή Price/kWh</p>
      )}
    </div>
  )
}

function formatTiers(tiers, variables) {
  if (!tiers || tiers.length === 0) return '—'
  return tiers.map(t => {
    const max = t.max_kwh != null ? t.max_kwh : '∞'
    let price
    if (t.formula && t.price_mode === 'formula') {
      price = evaluateFormula(t.formula, variables)
    } else {
      price = t.price_per_kwh
    }
    return `${t.min_kwh}–${max}: ${price}€`
  }).join(', ')
}

function parseTiers(tiers) {
  if (!tiers || !Array.isArray(tiers)) return []
  return tiers.map(t => ({
    min_kwh: t.min_kwh ?? '',
    max_kwh: t.max_kwh ?? '',
    price_per_kwh: t.price_per_kwh ?? '',
    price_mode: t.formula ? 'formula' : 'static',
    formula: t.formula || null
  }))
}

function serializeTiers(tiers) {
  return tiers
    .filter(t => t.price_per_kwh !== '' || t.formula)
    .map(t => {
      const tier = {
        min_kwh: t.min_kwh !== '' ? Number(t.min_kwh) : 0,
        max_kwh: t.max_kwh !== '' ? Number(t.max_kwh) : null,
        price_per_kwh: t.price_per_kwh !== '' ? Number(t.price_per_kwh) : null
      }
      if (t.price_mode === 'formula' && t.formula) {
        tier.formula = serializeFormula(t.formula)
      }
      return tier
    })
}

function serializeFormula(f) {
  if (!f) return null
  return {
    base_type: f.base_type,
    base_value: f.base_type === 'number' ? Number(f.base_value) || 0 : f.base_value,
    steps: (f.steps || []).map(s => ({
      op: s.op,
      val_type: s.val_type || 'number',
      val: s.val_type === 'variable' ? s.val : Number(s.val) || 0
    }))
  }
}

function computeAutoPrice(plan, variables) {
  const tea = Number(variables.TEA ?? variables.tea ?? 0)
  const tv = Number(plan.tv ?? 0)
  const ll = Number(plan.ll ?? 0)
  const lu = Number(plan.lu ?? 0)
  const alpha = Number(plan.alpha ?? 0)
  let md = 0
  if (tea < ll) {
    md = alpha * (tea - ll)
  } else if (tea > lu) {
    md = alpha * (tea - lu)
  }
  return Math.round((tv + md) * 100000) / 100000
}

function displayPrice(plan, variables) {
  if (plan.price_formula) {
    if (plan.price_formula.base_type === 'auto') {
      const computed = computeAutoPrice(plan, variables)
      return `${computed} (auto)`
    }
    const computed = evaluateFormula(plan.price_formula, variables)
    return computed != null ? `${computed} (fx)` : '—'
  }
  return plan.price_per_kwh != null ? `${plan.price_per_kwh}` : '—'
}

function displayNightPrice(plan, variables) {
  if (plan.night_price_formula) {
    const computed = evaluateFormula(plan.night_price_formula, variables)
    return computed != null ? `${computed} (fx)` : '—'
  }
  return plan.night_price_per_kwh != null ? `${plan.night_price_per_kwh}` : '—'
}

const CATEGORY_CLASSES = {
  'Σταθερό Τιμολόγιο': 'cat-fixed',
  'Κυμαινόμενο Τιμολόγιο': 'cat-variable',
  'Ειδικό Τιμολόγιο': 'cat-special',
  'Δυναμικό Τιμολόγιο': 'cat-dynamic'
}

function PlanEditModal({ plan, editData, onSetEditData, onSave, onCancel, providers, variables }) {
  const isVariable = plan.tariff_type === 'Κυμαινόμενο Τιμολόγιο'

  const prov = providers.find(p => p.id === plan.provider_id)
  const vars = {
    ...variables,
    ...(prov?.adjustment_factor != null ? { adjustment_factor: prov.adjustment_factor } : {})
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="modal modal-edit-plan">
        <h3>Επεξεργασία: {plan.plan_name}</h3>

        <div className="modal-info-row">
          <span className="modal-info-label">Provider:</span>
          <span>{plan.providers?.name ?? '—'}</span>
        </div>

        <div className="form-row">
          <label>
            <div className="price-edit-cell">
              <span>Price/kWh</span>
              <div className="mode-toggle-group">
                <button
                  type="button"
                  className={`btn-mode-toggle${editData.price_mode === 'static' ? ' active' : ''}`}
                  onClick={() => onSetEditData({ ...editData, price_mode: 'static' })}
                  title="Σταθερή τιμή"
                >
                  123
                </button>
                <button
                  type="button"
                  className={`btn-mode-toggle${editData.price_mode === 'formula' ? ' active' : ''}`}
                  onClick={() => onSetEditData({ ...editData, price_mode: 'formula' })}
                  title="Φόρμουλα"
                >
                  fx
                </button>
                {isVariable && (
                  <button
                    type="button"
                    className={`btn-mode-toggle${editData.price_mode === 'auto' ? ' active' : ''}`}
                    onClick={() => onSetEditData({ ...editData, price_mode: 'auto' })}
                    title="Αυτόματος υπολογισμός από Ll, TEA, α, Τβ"
                  >
                    auto
                  </button>
                )}
              </div>
            </div>
            {editData.price_mode === 'static' && (
              <input
                type="number"
                step="any"
                value={editData.price_per_kwh}
                onChange={e => onSetEditData({ ...editData, price_per_kwh: e.target.value })}
              />
            )}
            {editData.price_mode === 'auto' && (() => {
              const tea = Number(vars.TEA ?? vars.tea ?? 0)
              const ll = Number(editData.ll || 0)
              const lu = Number(editData.lu || 0)
              const computed = computeAutoPrice(
                { tv: editData.tv, ll: editData.ll, lu: editData.lu, alpha: editData.alpha },
                vars
              )
              let hint = '= Τβ'
              if (tea < ll) hint = '= Τβ + α(ΤΕΑ − Ll)'
              else if (tea > lu) hint = '= Τβ + α(ΤΕΑ − Lu)'
              return (
                <div className="auto-price-preview">
                  {computed} €/kWh
                  <span className="auto-price-hint">{hint} (ΜΔ {tea < ll || tea > lu ? '≠' : '='} 0)</span>
                </div>
              )
            })()}
          </label>
          <label>
            <div className="price-edit-cell">
              <span>Night/kWh</span>
              <button
                type="button"
                className={`btn-mode-toggle${editData.night_price_mode === 'formula' ? ' active' : ''}`}
                onClick={() => onSetEditData({
                  ...editData,
                  night_price_mode: editData.night_price_mode === 'formula' ? 'static' : 'formula'
                })}
                title="Εναλλαγή σταθερή/φόρμουλα"
              >
                fx
              </button>
            </div>
            {editData.night_price_mode !== 'formula' && (
              <input
                type="number"
                step="any"
                value={editData.night_price_per_kwh}
                onChange={e => onSetEditData({ ...editData, night_price_per_kwh: e.target.value })}
              />
            )}
          </label>
        </div>

        {editData.price_mode === 'formula' && (
          <div className="formula-section">
            <div className="formula-section-label">Φόρμουλα ημερήσιας τιμής/kWh</div>
            <FormulaBuilder
              formula={editData.price_formula}
              onChange={f => onSetEditData({ ...editData, price_formula: f })}
              variables={vars}
            />
          </div>
        )}

        {editData.night_price_mode === 'formula' && (
          <div className="formula-section">
            <div className="formula-section-label">Φόρμουλα νυχτερινής τιμής/kWh</div>
            <FormulaBuilder
              formula={editData.night_price_formula}
              onChange={f => onSetEditData({ ...editData, night_price_formula: f })}
              variables={vars}
            />
          </div>
        )}

        {isVariable && (
          <div className="form-row-3">
            <label>
              Ll
              <input type="number" step="any" value={editData.ll}
                onChange={e => onSetEditData({ ...editData, ll: e.target.value })} />
            </label>
            <label>
              Lu
              <input type="number" step="any" value={editData.lu}
                onChange={e => onSetEditData({ ...editData, lu: e.target.value })} />
            </label>
            <label>
              Τβ
              <input type="number" step="any" value={editData.tv}
                onChange={e => onSetEditData({ ...editData, tv: e.target.value })} />
            </label>
            <label>
              AF
              <input type="number" step="any" value={editData.af}
                onChange={e => onSetEditData({ ...editData, af: e.target.value })} />
            </label>
            <label>
              γ
              <input type="number" step="any" value={editData.gamma}
                onChange={e => onSetEditData({ ...editData, gamma: e.target.value })} />
            </label>
            <label>
              α
              <input type="number" step="any" value={editData.alpha}
                onChange={e => onSetEditData({ ...editData, alpha: e.target.value })} />
            </label>
          </div>
        )}

        <div className="form-row">
          <label>
            Monthly Fee (€)
            <input
              type="number"
              step="any"
              value={editData.monthly_fee_eur}
              onChange={e => onSetEditData({ ...editData, monthly_fee_eur: e.target.value })}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={editData.social_tariff}
              onChange={e => onSetEditData({ ...editData, social_tariff: e.target.checked })}
            />
            Κοινωνικό Τιμολόγιο
          </label>
        </div>

        <TierEditor
          tiers={editData.pricing_tiers}
          onChange={tiers => onSetEditData({ ...editData, pricing_tiers: tiers })}
          variables={vars}
        />

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onCancel}>Ακύρωση</button>
          <button className="btn-save" onClick={() => onSave(plan.id)}>Αποθήκευση</button>
        </div>
      </div>
    </div>
  )
}

function CategoryTable({ title, plans, providers, variables, onStartEdit, onDelete }) {
  const [collapsed, setCollapsed] = useState(false)
  const catClass = CATEGORY_CLASSES[title] || ''
  const isVariable = title === 'Κυμαινόμενο Τιμολόγιο'
  const colCount = isVariable ? 14 : 8

  function getVarsForProvider(providerId) {
    const prov = providers.find(p => p.id === providerId)
    return {
      ...variables,
      ...(prov?.adjustment_factor != null ? { adjustment_factor: prov.adjustment_factor } : {})
    }
  }

  return (
    <div className="category-section">
      <button
        className={`category-header ${catClass}${collapsed ? ' collapsed' : ''}`}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="category-title">
          <span className={`chevron${collapsed ? ' collapsed' : ''}`}>▾</span>
          {title}
        </span>
        <span className="category-count">{plans.length}</span>
      </button>
      {!collapsed && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Plan Name</th>
                <th>Price/kWh</th>
                <th>Night/kWh</th>
                {isVariable && <th>Ll</th>}
                {isVariable && <th>Lu</th>}
                {isVariable && <th>Τβ</th>}
                {isVariable && <th>AF</th>}
                {isVariable && <th>γ</th>}
                {isVariable && <th>α</th>}
                <th>Κλιμάκια</th>
                <th>Monthly Fee</th>
                <th>Social</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map(p => (
                <tr key={p.id}>
                  <TruncateCell>{p.providers?.name ?? '—'}</TruncateCell>
                  <td>{p.plan_name}</td>
                  <td>{displayPrice(p, getVarsForProvider(p.provider_id))}</td>
                  <td>{displayNightPrice(p, getVarsForProvider(p.provider_id))}</td>
                  {isVariable && <td>{p.ll != null ? p.ll : '—'}</td>}
                  {isVariable && <td>{p.lu != null ? p.lu : '—'}</td>}
                  {isVariable && <td>{p.tv != null ? p.tv : '—'}</td>}
                  {isVariable && <td>{p.af != null ? p.af : '—'}</td>}
                  {isVariable && <td>{p.gamma != null ? p.gamma : '—'}</td>}
                  {isVariable && <td>{p.alpha != null ? p.alpha : '—'}</td>}
                  <td className="tiers-cell">{formatTiers(p.pricing_tiers, getVarsForProvider(p.provider_id))}</td>
                  <td>{p.monthly_fee_eur != null ? `${p.monthly_fee_eur}€` : '—'}</td>
                  <td>{p.social_tariff ? 'Yes' : 'No'}</td>
                  <td className="actions">
                    <button className="btn-edit" onClick={() => onStartEdit(p)}>Edit</button>
                    <button className="btn-delete" onClick={() => onDelete(p.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {plans.length === 0 && (
                <tr><td colSpan={colCount} className="empty-row">Δεν υπάρχουν plans σε αυτή την κατηγορία</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function PlansByCategoryTab() {
  const [plans, setPlans] = useState([])
  const [providers, setProviders] = useState([])
  const [variables, setVariables] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editingPlan, setEditingPlan] = useState(null)
  const [editData, setEditData] = useState({})
  const [infoPanelOpen, setInfoPanelOpen] = useState(false)

  useEffect(() => {
    fetchPlans()
    fetchProviders()
    fetchVariables()
  }, [])

  async function fetchVariables() {
    const { data } = await supabase.from('settings').select('key, value')
    if (data) {
      const vars = {}
      data.forEach(r => { vars[r.key] = r.value })
      setVariables(vars)
    }
  }

  async function fetchProviders() {
    const cached = cacheGet(CACHE_KEY_PROVIDERS)
    if (cached) {
      setProviders(cached.map(p => ({ id: p.id, name: p.name, adjustment_factor: p.adjustment_factor })))
      return
    }
    const { data } = await supabase
      .from('providers')
      .select('id, name, adjustment_factor')
      .order('name')
    if (data) setProviders(data)
  }

  async function fetchPlans(skipCache = false) {
    setLoading(true)
    if (!skipCache) {
      const cached = cacheGet(CACHE_KEY_PLANS)
      if (cached) { setPlans(cached); setLoading(false); return }
    }
    const { data, error } = await supabase
      .from('plans')
      .select('*, providers(name)')
      .order('created_at', { ascending: true })
    if (error) setError(error.message)
    else { setPlans(data); cacheSet(CACHE_KEY_PLANS, data) }
    setLoading(false)
  }

  function startEdit(plan) {
    setEditingPlan(plan)
    setEditingId(plan.id)
    setEditData({
      provider_id: plan.provider_id,
      price_per_kwh: plan.price_per_kwh ?? '',
      price_mode: plan.price_formula
        ? (plan.price_formula.base_type === 'auto' ? 'auto' : 'formula')
        : 'static',
      price_formula: plan.price_formula && plan.price_formula.base_type !== 'auto'
        ? plan.price_formula
        : { base_type: 'variable', base_value: '', steps: [] },
      night_price_per_kwh: plan.night_price_per_kwh ?? '',
      night_price_mode: plan.night_price_formula ? 'formula' : 'static',
      night_price_formula: plan.night_price_formula || { base_type: 'variable', base_value: '', steps: [] },
      ll: plan.ll ?? '',
      lu: plan.lu ?? '',
      tv: plan.tv ?? '',
      af: plan.af ?? '',
      gamma: plan.gamma ?? '',
      alpha: plan.alpha ?? '',
      monthly_fee_eur: plan.monthly_fee_eur ?? '',
      social_tariff: plan.social_tariff,
      pricing_tiers: parseTiers(plan.pricing_tiers)
    })
  }

  async function saveEdit(id) {
    setError(null)
    const updateData = {
      ll: editData.ll !== '' ? Number(editData.ll) : null,
      lu: editData.lu !== '' ? Number(editData.lu) : null,
      tv: editData.tv !== '' ? Number(editData.tv) : null,
      af: editData.af !== '' ? Number(editData.af) : null,
      gamma: editData.gamma !== '' ? Number(editData.gamma) : null,
      alpha: editData.alpha !== '' ? Number(editData.alpha) : null,
      price_per_kwh: editData.price_mode === 'static' && editData.price_per_kwh !== '' ? Number(editData.price_per_kwh) : null,
      price_formula: editData.price_mode === 'formula'
        ? serializeFormula(editData.price_formula)
        : editData.price_mode === 'auto'
          ? { base_type: 'auto' }
          : null,
      night_price_per_kwh: editData.night_price_per_kwh !== '' ? Number(editData.night_price_per_kwh) : null,
      night_price_formula: editData.night_price_mode === 'formula' ? serializeFormula(editData.night_price_formula) : null,
      monthly_fee_eur: editData.monthly_fee_eur !== '' ? Number(editData.monthly_fee_eur) : null,
      social_tariff: editData.social_tariff,
      pricing_tiers: serializeTiers(editData.pricing_tiers)
    }
    const { error } = await supabase.from('plans').update(updateData).eq('id', id)
    if (error) { setError(error.message); return }
    setEditingId(null)
    setEditingPlan(null)
    cacheInvalidate(CACHE_KEY_PLANS)
    fetchPlans(true)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingPlan(null)
  }

  async function handleDelete(id) {
    if (!confirm('Διαγραφή αυτού του plan;')) return
    setError(null)
    const { error } = await supabase.from('plans').delete().eq('id', id)
    if (error) { setError(error.message); return }
    cacheInvalidate(CACHE_KEY_PLANS)
    fetchPlans(true)
  }

  const filtered = plans.filter(p =>
    p.plan_name.toLowerCase().includes(search.toLowerCase()) ||
    (p.providers?.name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const grouped = TARIFF_TYPES.reduce((acc, type) => {
    acc[type] = filtered.filter(p => p.tariff_type === type)
    return acc
  }, {})

  return (
    <div className="plans-by-category-tab">
      <div className="tab-toolbar">
        <h2>Plans ανά Κατηγορία</h2>
        <div className="toolbar-right">
          <input
            className="search-input"
            type="text"
            placeholder="Αναζήτηση plan ή provider..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="category-layout">
        <div className="category-main">
          {loading ? (
            <p className="loading-text">Φόρτωση...</p>
          ) : (
            <div className="category-list">
              {TARIFF_TYPES.map(type => (
                <CategoryTable
                  key={type}
                  title={type}
                  plans={grouped[type]}
                  providers={providers}
                  variables={variables}
                  onStartEdit={startEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>

        <aside className={`info-panel${infoPanelOpen ? ' open' : ''}`}>
          <button className="info-panel-toggle" onClick={() => setInfoPanelOpen(!infoPanelOpen)}>
            <span className={`info-chevron${infoPanelOpen ? '' : ' collapsed'}`}>▾</span>
            Πληροφορίες
          </button>

          {infoPanelOpen && (
            <div className="info-panel-body">
              <section className="info-section">
                <h4>Κυμαινόμενο — Στήλες</h4>
                <dl>
                  <dt>Ll</dt><dd>Κάτω όριο ενεργοποίησης</dd>
                  <dt>Lu</dt><dd>Άνω όριο ενεργοποίησης</dd>
                  <dt>Τβ</dt><dd>Τιμή βάσης</dd>
                  <dt>AF</dt><dd>Adjustment Factor</dd>
                  <dt>γ</dt><dd>Συντελεστής γ</dd>
                  <dt>α</dt><dd>Συντελεστής α</dd>
                </dl>
              </section>

              <section className="info-section">
                <h4>Μηχανισμός Διακύμανσης</h4>
                <dl>
                  <dt>ΤΕΑ &lt; Ll</dt><dd>ΜΔ = α(ΤΕΑ − Ll)</dd>
                  <dt>Ll ≤ ΤΕΑ ≤ Lu</dt><dd>ΜΔ = 0</dd>
                  <dt>ΤΕΑ &gt; Lu</dt><dd>ΜΔ = α(ΤΕΑ − Lu)</dd>
                  <dt>Τιμή kWh</dt><dd>T = Τβ + ΜΔ</dd>
                </dl>
              </section>
            </div>
          )}
        </aside>
      </div>

      {editingPlan && (
        <PlanEditModal
          plan={editingPlan}
          editData={editData}
          onSetEditData={setEditData}
          onSave={saveEdit}
          onCancel={cancelEdit}
          providers={providers}
          variables={variables}
        />
      )}
    </div>
  )
}
