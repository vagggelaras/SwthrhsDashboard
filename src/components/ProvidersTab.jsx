import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { cacheGet, cacheSet, cacheInvalidate } from '../lib/cache'
import './ProvidersTab.css'

const CACHE_KEY = 'admin_providers'

export default function ProvidersTab() {
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})
  const [form, setForm] = useState({ name: '', adjustment_factor: '' })
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)

  const filtered = providers.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => { fetchProviders() }, [])

  async function fetchProviders(skipCache = false) {
    setLoading(true)
    if (!skipCache) {
      const cached = cacheGet(CACHE_KEY)
      if (cached) { setProviders(cached); setLoading(false); return }
    }
    const { data, error } = await supabase
      .from('providers')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) setError(error.message)
    else { setProviders(data); cacheSet(CACHE_KEY, data) }
    setLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.from('providers').insert({
      name: form.name,
      adjustment_factor: form.adjustment_factor ? Number(form.adjustment_factor) : null
    })
    if (error) { setError(error.message); return }
    setForm({ name: '', adjustment_factor: '' })
    setShowModal(false)
    cacheInvalidate(CACHE_KEY, 'admin_plans')
    fetchProviders(true)
  }

  function startEdit(provider) {
    setEditingId(provider.id)
    setEditData({ name: provider.name, adjustment_factor: provider.adjustment_factor ?? '' })
  }

  async function saveEdit(id) {
    setError(null)
    const { error } = await supabase.from('providers').update({
      name: editData.name,
      adjustment_factor: editData.adjustment_factor !== '' ? Number(editData.adjustment_factor) : null
    }).eq('id', id)
    if (error) { setError(error.message); return }
    setEditingId(null)
    cacheInvalidate(CACHE_KEY, 'admin_plans')
    fetchProviders(true)
  }

  async function handleDelete(id) {
    if (!confirm('Διαγραφή αυτού του provider;')) return
    setError(null)
    const { error } = await supabase.from('providers').delete().eq('id', id)
    if (error) { setError(error.message); return }
    cacheInvalidate(CACHE_KEY, 'admin_plans')
    fetchProviders(true)
  }

  return (
    <div className="providers-tab">
      <div className="tab-toolbar">
        <h2>Providers</h2>
        <div className="toolbar-right">
          <input
            className="search-input"
            type="text"
            placeholder="Αναζήτηση provider..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="btn-primary" onClick={() => setShowModal(true)}>+ Add Provider</button>
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
                <th>Name</th>
                <th>Adjustment Factor</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  {editingId === p.id ? (
                    <>
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
                <tr><td colSpan="4" className="empty-row">{search ? 'Κανένα αποτέλεσμα' : 'Δεν υπάρχουν providers'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Add Provider</h3>
            <form onSubmit={handleAdd}>
              <label>
                Name
                <input
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </label>
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
    </div>
  )
}
