import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { cacheGet, cacheSet, cacheInvalidate } from '../lib/cache'
import './ProvidersTab.css'

const CACHE_KEY = 'admin_providers'

function svgToDataUri(svg) {
  if (!svg || !svg.trim()) return null
  const trimmed = svg.trim()
  if (trimmed.startsWith('data:')) return trimmed
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(trimmed)))
}

function dataUriToSvg(dataUri) {
  if (!dataUri) return ''
  if (!dataUri.startsWith('data:image/svg+xml;base64,')) return dataUri
  try {
    return decodeURIComponent(escape(atob(dataUri.replace('data:image/svg+xml;base64,', ''))))
  } catch {
    return ''
  }
}

export default function ProvidersTab({ serviceType }) {
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})
  const [form, setForm] = useState({ name: '', adjustment_factor: '', logo_svg: '' })
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)
  const [editLogoModal, setEditLogoModal] = useState(null)

  const cacheKey = `${CACHE_KEY}_${serviceType}`

  const filtered = providers.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    fetchProviders()
  }, [serviceType])

  async function fetchProviders(skipCache = false) {
    setLoading(true)
    if (!skipCache) {
      const cached = cacheGet(cacheKey)
      if (cached) { setProviders(cached); setLoading(false); return }
    }
    const { data, error } = await supabase
      .from('providers')
      .select('*')
      .eq('service_type', serviceType)
      .order('created_at', { ascending: true })
    if (error) setError(error.message)
    else { setProviders(data); cacheSet(cacheKey, data) }
    setLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.from('providers').insert({
      name: form.name,
      adjustment_factor: form.adjustment_factor ? Number(form.adjustment_factor) : null,
      logo_url: svgToDataUri(form.logo_svg),
      service_type: serviceType
    })
    if (error) { setError(error.message); return }
    setForm({ name: '', adjustment_factor: '', logo_svg: '' })
    setShowModal(false)
    cacheInvalidate(cacheKey, 'admin_plans')
    fetchProviders(true)
  }

  function startEdit(provider) {
    setEditingId(provider.id)
    setEditData({
      name: provider.name,
      adjustment_factor: provider.adjustment_factor ?? '',
    })
  }

  async function saveEdit(id) {
    setError(null)
    const { error } = await supabase.from('providers').update({
      name: editData.name,
      adjustment_factor: editData.adjustment_factor !== '' ? Number(editData.adjustment_factor) : null,
    }).eq('id', id)
    if (error) { setError(error.message); return }
    setEditingId(null)
    cacheInvalidate(cacheKey, 'admin_plans')
    fetchProviders(true)
  }

  function openLogoModal(provider) {
    setEditLogoModal({
      id: provider.id,
      name: provider.name,
      svg: dataUriToSvg(provider.logo_url)
    })
  }

  async function saveLogoEdit() {
    setError(null)
    const { error } = await supabase.from('providers').update({
      logo_url: svgToDataUri(editLogoModal.svg)
    }).eq('id', editLogoModal.id)
    if (error) { setError(error.message); return }
    setEditLogoModal(null)
    cacheInvalidate(cacheKey, 'admin_plans')
    fetchProviders(true)
  }

  async function handleDelete(id) {
    if (!confirm('Διαγραφή αυτού του provider;')) return
    setError(null)
    const { error } = await supabase.from('providers').delete().eq('id', id)
    if (error) { setError(error.message); return }
    cacheInvalidate(cacheKey, 'admin_plans')
    fetchProviders(true)
  }

  const serviceLabel = serviceType === 'electricity' ? 'Ρεύματος' : 'Αερίου'

  return (
    <div className="providers-tab">
      <div className="tab-toolbar">
        <h2>Πάροχοι {serviceLabel}</h2>
        <div className="toolbar-right">
          <input
            className="search-input"
            type="text"
            placeholder="Αναζήτηση provider..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="btn-primary" onClick={() => setShowModal(true)}>+ Νέος Πάροχος</button>
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
                <th>Logo</th>
                <th>Όνομα</th>
                <th>Adjustment Factor</th>
                <th>Ημ/νία</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  {editingId === p.id ? (
                    <>
                      <td>
                        {p.logo_url
                          ? <img src={p.logo_url} alt="" className="provider-logo-preview" onClick={() => openLogoModal(p)} style={{ cursor: 'pointer' }} />
                          : <button className="btn-edit btn-small" onClick={() => openLogoModal(p)}>+ Logo</button>
                        }
                      </td>
                      <td>
                        <input
                          className="inline-input"
                          value={editData.name}
                          onChange={e => setEditData({ ...editData, name: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="inline-input"
                          type="number"
                          step="any"
                          value={editData.adjustment_factor}
                          onChange={e => setEditData({ ...editData, adjustment_factor: e.target.value })}
                        />
                      </td>
                      <td>{new Date(p.created_at).toLocaleDateString('el-GR')}</td>
                      <td className="actions">
                        <button className="btn-save" onClick={() => saveEdit(p.id)}>Save</button>
                        <button className="btn-cancel" onClick={() => setEditingId(null)}>Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        {p.logo_url
                          ? <img src={p.logo_url} alt={p.name} className="provider-logo-preview" onClick={() => openLogoModal(p)} style={{ cursor: 'pointer' }} title="Κλικ για επεξεργασία logo" />
                          : <button className="btn-edit btn-small" onClick={() => openLogoModal(p)}>+ Logo</button>
                        }
                      </td>
                      <td>{p.name}</td>
                      <td>{p.adjustment_factor ?? '—'}</td>
                      <td>{new Date(p.created_at).toLocaleDateString('el-GR')}</td>
                      <td className="actions">
                        <button className="btn-edit" onClick={() => startEdit(p)}>Edit</button>
                        <button className="btn-delete" onClick={() => handleDelete(p.id)}>Delete</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="5" className="empty-row">{search ? 'Κανένα αποτέλεσμα' : 'Δεν υπάρχουν providers'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Provider Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
            <h3>Νέος Πάροχος ({serviceType === 'electricity' ? 'Ρεύμα' : 'Αέριο'})</h3>
            <form onSubmit={handleAdd}>
              <label>
                Όνομα
                <input
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                SVG Logo
                <textarea
                  className="svg-textarea"
                  placeholder="Κάντε paste τον SVG κώδικα εδώ (<svg>...</svg>)"
                  value={form.logo_svg}
                  onChange={e => setForm({ ...form, logo_svg: e.target.value })}
                  rows={5}
                />
              </label>
              {form.logo_svg && (
                <div className="logo-preview-box">
                  <span>Preview:</span>
                  <img src={svgToDataUri(form.logo_svg)} alt="preview" className="logo-preview-large" />
                </div>
              )}
              <label>
                Adjustment Factor
                <input
                  type="number"
                  step="any"
                  value={form.adjustment_factor}
                  onChange={e => setForm({ ...form, adjustment_factor: e.target.value })}
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Logo Modal */}
      {editLogoModal && (
        <div className="modal-overlay" onClick={() => setEditLogoModal(null)}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
            <h3>Logo: {editLogoModal.name}</h3>
            <label>
              SVG Κώδικας
              <textarea
                className="svg-textarea"
                placeholder="Κάντε paste τον SVG κώδικα εδώ (<svg>...</svg>)"
                value={editLogoModal.svg}
                onChange={e => setEditLogoModal({ ...editLogoModal, svg: e.target.value })}
                rows={8}
              />
            </label>
            {editLogoModal.svg && (
              <div className="logo-preview-box">
                <span>Preview:</span>
                <img src={svgToDataUri(editLogoModal.svg)} alt="preview" className="logo-preview-large" />
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="btn-cancel" onClick={() => setEditLogoModal(null)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={saveLogoEdit}>Αποθήκευση</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
