import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { cacheGet, cacheSet, cacheInvalidate } from '../lib/cache'
import { evaluateFormula } from '../lib/formula'
import FormulaBuilder from './FormulaBuilder'
import './PlansTab.css'

const CACHE_KEY_PLANS = 'admin_plans'
const CACHE_KEY_PROVIDERS = 'admin_providers'

const TARIFF_TYPES = [
  'Σταθερό Τιμολόγιο',
  'Κυμαινόμενο Τιμολόγιο',
  'Ειδικό Τιμολόγιο',
  'Δυναμικό Τιμολόγιο'
]

const emptyTier = { min_kwh: '', max_kwh: '', price_per_kwh: '' }

const emptyForm = {
  provider_id: '',
  plan_name: '',
  tariff_type: TARIFF_TYPES[0],
  price_per_kwh: '',
  price_mode: 'static',
  price_formula: null,
  night_price_per_kwh: '',
  night_price_mode: 'static',
  night_price_formula: null,
  monthly_fee_eur: '',
  social_tariff: true,
  pricing_tiers: []
}

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

function displayPrice(plan, variables) {
  if (plan.price_formula) {
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

export default function PlansTab() {
  const [plans, setPlans] = useState([])
  const [providers, setProviders] = useState([])
  const [variables, setVariables] = useState({})
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)

  const filtered = plans.filter(p =>
    p.plan_name.toLowerCase().includes(search.toLowerCase()) ||
    (p.providers?.name ?? '').toLowerCase().includes(search.toLowerCase())
  )

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

  async function fetchProviders(skipCache = false) {
    if (!skipCache) {
      const cached = cacheGet(CACHE_KEY_PROVIDERS)
      if (cached) {
        setProviders(cached.map(p => ({ id: p.id, name: p.name, adjustment_factor: p.adjustment_factor })))
        return
      }
    }
    const { data } = await supabase
      .from('providers')
      .select('id, name, adjustment_factor')
      .order('name')
    if (data) setProviders(data)
  }

  function getVarsForProvider(providerId) {
    const prov = providers.find(p => p.id === providerId)
    return {
      ...variables,
      ...(prov?.adjustment_factor != null ? { adjustment_factor: prov.adjustment_factor } : {})
    }
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

  async function handleAdd(e) {
    e.preventDefault()
    setError(null)
    const insertData = {
      provider_id: form.provider_id,
      plan_name: form.plan_name,
      tariff_type: form.tariff_type,
      price_per_kwh: form.price_per_kwh ? Number(form.price_per_kwh) : null,
      price_formula: form.price_mode === 'formula' ? serializeFormula(form.price_formula) : null,
      night_price_per_kwh: form.night_price_per_kwh ? Number(form.night_price_per_kwh) : null,
      night_price_formula: form.night_price_mode === 'formula' ? serializeFormula(form.night_price_formula) : null,
      monthly_fee_eur: form.monthly_fee_eur ? Number(form.monthly_fee_eur) : null,
      social_tariff: form.social_tariff,
      pricing_tiers: serializeTiers(form.pricing_tiers)
    }
    const { error } = await supabase.from('plans').insert(insertData)
    if (error) { setError(error.message); return }
    setForm(emptyForm)
    setShowModal(false)
    cacheInvalidate(CACHE_KEY_PLANS)
    fetchPlans(true)
  }

  function startEdit(plan) {
    setEditingId(plan.id)
    setEditData({
      provider_id: plan.provider_id,
      plan_name: plan.plan_name,
      tariff_type: plan.tariff_type,
      price_per_kwh: plan.price_per_kwh ?? '',
      price_mode: plan.price_formula ? 'formula' : 'static',
      price_formula: plan.price_formula || { base_type: 'variable', base_value: '', steps: [] },
      night_price_per_kwh: plan.night_price_per_kwh ?? '',
      night_price_mode: plan.night_price_formula ? 'formula' : 'static',
      night_price_formula: plan.night_price_formula || { base_type: 'variable', base_value: '', steps: [] },
      monthly_fee_eur: plan.monthly_fee_eur ?? '',
      social_tariff: plan.social_tariff,
      pricing_tiers: parseTiers(plan.pricing_tiers)
    })
  }

  async function saveEdit(id) {
    setError(null)
    const updateData = {
      provider_id: editData.provider_id,
      plan_name: editData.plan_name,
      tariff_type: editData.tariff_type,
      price_per_kwh: editData.price_per_kwh !== '' ? Number(editData.price_per_kwh) : null,
      price_formula: editData.price_mode === 'formula' ? serializeFormula(editData.price_formula) : null,
      night_price_per_kwh: editData.night_price_per_kwh !== '' ? Number(editData.night_price_per_kwh) : null,
      night_price_formula: editData.night_price_mode === 'formula' ? serializeFormula(editData.night_price_formula) : null,
      monthly_fee_eur: editData.monthly_fee_eur !== '' ? Number(editData.monthly_fee_eur) : null,
      social_tariff: editData.social_tariff,
      pricing_tiers: serializeTiers(editData.pricing_tiers)
    }
    const { error } = await supabase.from('plans').update(updateData).eq('id', id)
    if (error) { setError(error.message); return }
    setEditingId(null)
    cacheInvalidate(CACHE_KEY_PLANS)
    fetchPlans(true)
  }

  async function handleDelete(id) {
    if (!confirm('Διαγραφή αυτού του plan;')) return
    setError(null)
    const { error } = await supabase.from('plans').delete().eq('id', id)
    if (error) { setError(error.message); return }
    cacheInvalidate(CACHE_KEY_PLANS)
    fetchPlans(true)
  }

  return (
    <div className="plans-tab">
      <div className="tab-toolbar">
        <h2>Plans (Contracts)</h2>
        <div className="toolbar-right">
          <input
            className="search-input"
            type="text"
            placeholder="Αναζήτηση plan ή provider..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="btn-primary" onClick={() => setShowModal(true)}>+ Add Contract</button>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {loading ? (
        <p className="loading-text">Φόρτωση...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Plan Name</th>
                <th>Tariff Type</th>
                <th>Price/kWh</th>
                <th>Night/kWh</th>
                <th>Κλιμάκια</th>
                <th>Monthly Fee</th>
                <th>Social</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <React.Fragment key={p.id}>
                  <tr>
                    {editingId === p.id ? (
                      <>
                        <td>
                          <select
                            className="inline-input"
                            value={editData.provider_id}
                            onChange={e => setEditData({ ...editData, provider_id: e.target.value })}
                          >
                            {providers.map(prov => (
                              <option key={prov.id} value={prov.id}>{prov.name}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className="inline-input"
                            value={editData.plan_name}
                            onChange={e => setEditData({ ...editData, plan_name: e.target.value })}
                          />
                        </td>
                        <td>
                          <select
                            className="inline-input"
                            value={editData.tariff_type}
                            onChange={e => setEditData({ ...editData, tariff_type: e.target.value })}
                          >
                            {TARIFF_TYPES.map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div className="price-edit-cell">
                            {editData.price_mode !== 'formula' && (
                              <input
                                className="inline-input"
                                type="number"
                                step="any"
                                value={editData.price_per_kwh}
                                onChange={e => setEditData({ ...editData, price_per_kwh: e.target.value })}
                              />
                            )}
                            {editData.price_mode === 'formula' && (
                              <span className="fx-badge">fx</span>
                            )}
                            <button
                              type="button"
                              className={`btn-mode-toggle${editData.price_mode === 'formula' ? ' active' : ''}`}
                              onClick={() => setEditData({
                                ...editData,
                                price_mode: editData.price_mode === 'formula' ? 'static' : 'formula'
                              })}
                              title="Εναλλαγή σταθερή/φόρμουλα"
                            >
                              fx
                            </button>
                          </div>
                        </td>
                        <td>
                          <div className="price-edit-cell">
                            {editData.night_price_mode !== 'formula' && (
                              <input
                                className="inline-input"
                                type="number"
                                step="any"
                                value={editData.night_price_per_kwh}
                                onChange={e => setEditData({ ...editData, night_price_per_kwh: e.target.value })}
                              />
                            )}
                            {editData.night_price_mode === 'formula' && (
                              <span className="fx-badge">fx</span>
                            )}
                            <button
                              type="button"
                              className={`btn-mode-toggle${editData.night_price_mode === 'formula' ? ' active' : ''}`}
                              onClick={() => setEditData({
                                ...editData,
                                night_price_mode: editData.night_price_mode === 'formula' ? 'static' : 'formula'
                              })}
                              title="Εναλλαγή σταθερή/φόρμουλα"
                            >
                              fx
                            </button>
                          </div>
                        </td>
                        <td className="tiers-cell">{formatTiers(editData.pricing_tiers, getVarsForProvider(editData.provider_id))}</td>
                        <td>
                          <input
                            className="inline-input"
                            type="number"
                            step="any"
                            value={editData.monthly_fee_eur}
                            onChange={e => setEditData({ ...editData, monthly_fee_eur: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={editData.social_tariff}
                            onChange={e => setEditData({ ...editData, social_tariff: e.target.checked })}
                          />
                        </td>
                        <td className="actions">
                          <button className="btn-save" onClick={() => saveEdit(p.id)}>Save</button>
                          <button className="btn-cancel" onClick={() => setEditingId(null)}>Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{p.providers?.name ?? '—'}</td>
                        <td>{p.plan_name}</td>
                        <td><span className="tariff-badge">{p.tariff_type}</span></td>
                        <td>{displayPrice(p, getVarsForProvider(p.provider_id))}</td>
                        <td>{displayNightPrice(p, getVarsForProvider(p.provider_id))}</td>
                        <td className="tiers-cell">{formatTiers(p.pricing_tiers, getVarsForProvider(p.provider_id))}</td>
                        <td>{p.monthly_fee_eur != null ? `${p.monthly_fee_eur}€` : '—'}</td>
                        <td>{p.social_tariff ? 'Yes' : 'No'}</td>
                        <td className="actions">
                          <button className="btn-edit" onClick={() => startEdit(p)}>Edit</button>
                          <button className="btn-delete" onClick={() => handleDelete(p.id)}>Delete</button>
                        </td>
                      </>
                    )}
                  </tr>
                  {editingId === p.id && (
                    <>
                      {editData.price_mode === 'formula' && (
                        <tr className="tier-edit-row">
                          <td colSpan="9">
                            <div className="formula-section-label">Φόρμουλα ημερήσιας τιμής/kWh</div>
                            <FormulaBuilder
                              formula={editData.price_formula}
                              onChange={f => setEditData({ ...editData, price_formula: f })}
                              variables={getVarsForProvider(editData.provider_id)}
                            />
                          </td>
                        </tr>
                      )}
                      {editData.night_price_mode === 'formula' && (
                        <tr className="tier-edit-row">
                          <td colSpan="9">
                            <div className="formula-section-label">Φόρμουλα νυχτερινής τιμής/kWh</div>
                            <FormulaBuilder
                              formula={editData.night_price_formula}
                              onChange={f => setEditData({ ...editData, night_price_formula: f })}
                              variables={getVarsForProvider(editData.provider_id)}
                            />
                          </td>
                        </tr>
                      )}
                      <tr className="tier-edit-row">
                        <td colSpan="9">
                          <TierEditor
                            tiers={editData.pricing_tiers}
                            onChange={tiers => setEditData({ ...editData, pricing_tiers: tiers })}
                            variables={getVarsForProvider(editData.provider_id)}
                          />
                        </td>
                      </tr>
                    </>
                  )}
                </React.Fragment>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="9" className="empty-row">{search ? 'Κανένα αποτέλεσμα' : 'Δεν υπάρχουν plans'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
            <h3>Add Contract</h3>
            <form onSubmit={handleAdd}>
              <label>
                Provider
                <select
                  required
                  value={form.provider_id}
                  onChange={e => setForm({ ...form, provider_id: e.target.value })}
                >
                  <option value="">-- Επιλογή --</option>
                  {providers.map(prov => (
                    <option key={prov.id} value={prov.id}>{prov.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Plan Name
                <input
                  required
                  value={form.plan_name}
                  onChange={e => setForm({ ...form, plan_name: e.target.value })}
                />
              </label>
              <label>
                Tariff Type
                <select
                  value={form.tariff_type}
                  onChange={e => setForm({ ...form, tariff_type: e.target.value })}
                >
                  {TARIFF_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>

              <div className="price-section">
                <div className="price-section-header">
                  <span>Price / kWh</span>
                  <button
                    type="button"
                    className={`btn-mode-toggle${form.price_mode === 'formula' ? ' active' : ''}`}
                    onClick={() => setForm({
                      ...form,
                      price_mode: form.price_mode === 'formula' ? 'static' : 'formula',
                      price_formula: form.price_formula || { base_type: 'variable', base_value: '', steps: [] }
                    })}
                  >
                    fx
                  </button>
                </div>
                {form.price_mode === 'static' ? (
                  <div className="form-row">
                    <label>
                      Σταθερή τιμή (€/kWh)
                      <input
                        type="number"
                        step="any"
                        value={form.price_per_kwh}
                        onChange={e => setForm({ ...form, price_per_kwh: e.target.value })}
                      />
                    </label>
                    <label>
                      Monthly Fee (€)
                      <input
                        type="number"
                        step="any"
                        value={form.monthly_fee_eur}
                        onChange={e => setForm({ ...form, monthly_fee_eur: e.target.value })}
                      />
                    </label>
                  </div>
                ) : (
                  <>
                    <FormulaBuilder
                      formula={form.price_formula}
                      onChange={f => setForm({ ...form, price_formula: f })}
                      variables={getVarsForProvider(form.provider_id)}
                    />
                    <label style={{ marginTop: '0.75rem' }}>
                      Monthly Fee (€)
                      <input
                        type="number"
                        step="any"
                        value={form.monthly_fee_eur}
                        onChange={e => setForm({ ...form, monthly_fee_eur: e.target.value })}
                      />
                    </label>
                  </>
                )}
              </div>

              <div className="price-section">
                <div className="price-section-header">
                  <span>Νυχτερινή τιμή / kWh</span>
                  <button
                    type="button"
                    className={`btn-mode-toggle${form.night_price_mode === 'formula' ? ' active' : ''}`}
                    onClick={() => setForm({
                      ...form,
                      night_price_mode: form.night_price_mode === 'formula' ? 'static' : 'formula',
                      night_price_formula: form.night_price_formula || { base_type: 'variable', base_value: '', steps: [] }
                    })}
                  >
                    fx
                  </button>
                </div>
                {form.night_price_mode === 'static' ? (
                  <label>
                    Σταθερή νυχτερινή τιμή (€/kWh)
                    <input
                      type="number"
                      step="any"
                      value={form.night_price_per_kwh}
                      onChange={e => setForm({ ...form, night_price_per_kwh: e.target.value })}
                    />
                  </label>
                ) : (
                  <FormulaBuilder
                    formula={form.night_price_formula}
                    onChange={f => setForm({ ...form, night_price_formula: f })}
                    variables={getVarsForProvider(form.provider_id)}
                  />
                )}
              </div>

              <TierEditor
                tiers={form.pricing_tiers}
                onChange={tiers => setForm({ ...form, pricing_tiers: tiers })}
                variables={getVarsForProvider(form.provider_id)}
              />
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.social_tariff}
                  onChange={e => setForm({ ...form, social_tariff: e.target.checked })}
                />
                Social Tariff
              </label>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
