import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { PlusCircle, Search, ShieldAlert, AlertTriangle, CheckCircle, Clock, KeyRound, X } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

export default function Cases() {
  const navigate = useNavigate()
  const { key, role } = useKey()
  const isSuperAdmin = role === 'superadmin'
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [confFilter, setConfFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [doctors, setDoctors] = useState([])
  const [assigningId, setAssigningId] = useState(null)

  function loadCases() {
    if (!key) { setLoading(false); return }
    fetch('/api/cases', { headers: { 'x-api-key': key } })
      .then(r => r.json())
      .then(data => { setCases(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { loadCases() }, [key])

  useEffect(() => {
    if (!key || !isSuperAdmin) return
    fetch('/api/admin/users', { headers: { 'x-api-key': key } })
      .then(r => r.json())
      .then(data => setDoctors((data.users || []).filter(u => u.active)))
      .catch(() => {})
  }, [key, isSuperAdmin])

  async function assignCase(caseId, userId) {
    if (!userId) return
    setAssigningId(caseId)
    try {
      const res = await fetch(`/api/cases/${caseId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to assign case')
      toast.success(`Case assigned to ${data.assigned_to_name}`)
      loadCases()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setAssigningId(null)
    }
  }

  function getStatus(c) {
    if (c.emergency_detected) return 'emergency'
    if (c.requires_urgent_review) return 'urgent'
    if (c.approved) return 'approved'
    return 'pending'
  }

  const filtered = cases.filter(c => {
    const q = search.toLowerCase()
    if (q && !(
      c.presenting_complaint?.toLowerCase().includes(q) ||
      c.case_id.includes(q) ||
      String(c.age).includes(q)
    )) return false

    if (statusFilter !== 'all' && getStatus(c) !== statusFilter) return false
    if (confFilter !== 'all' && c.confidence_level !== confFilter) return false

    if (dateFrom) {
      const d = new Date(c.created_at)
      if (d < new Date(dateFrom + 'T00:00:00')) return false
    }
    if (dateTo) {
      const d = new Date(c.created_at)
      if (d > new Date(dateTo + 'T23:59:59')) return false
    }
    return true
  })

  function clearFilters() {
    setSearch('')
    setStatusFilter('all')
    setConfFilter('all')
    setDateFrom('')
    setDateTo('')
  }

  const hasActiveFilters = search || statusFilter !== 'all' || confFilter !== 'all' || dateFrom || dateTo

  return (
    <div>
      <div className="topbar">
        <span className="topbar-title">All Cases</span>
        <div className="topbar-right">
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/cases/new')}>
            <PlusCircle size={14} /> New Case
          </button>
        </div>
      </div>

      <div style={{ padding: '24px 32px' }}>
        <div className="card">
          <div className="card-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span className="card-title">Showing {filtered.length} of {cases.length} cases</span>
              {hasActiveFilters && (
                <button className="btn btn-secondary btn-sm" onClick={clearFilters}>
                  <X size={13} /> Clear filters
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                <input
                  className="form-input"
                  style={{ paddingLeft: 32, width: 220 }}
                  placeholder="Search cases…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <select className="form-input" style={{ width: 150 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="emergency">Emergency</option>
                <option value="urgent">Urgent</option>
              </select>
              <select className="form-input" style={{ width: 160 }} value={confFilter} onChange={e => setConfFilter(e.target.value)}>
                <option value="all">All confidence</option>
                <option value="high">High</option>
                <option value="moderate">Moderate</option>
                <option value="low">Low</option>
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--text3)' }}>From</label>
                <input type="date" className="form-input" style={{ width: 145 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--text3)' }}>To</label>
                <input type="date" className="form-input" style={{ width: 145 }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="table-wrap">
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <div className="spinner spinner-dark" style={{ margin: '0 auto' }} />
              </div>
            ) : !key ? (
              <div className="empty-state">
                <KeyRound />
                <p>Connect an API key via Logs &amp; Analytics to view your cases.</p>
                <button className="btn btn-secondary mt-4" onClick={() => navigate('/logs')}>Go to Logs</button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <p>{hasActiveFilters ? 'No matching cases.' : 'No cases yet.'}</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Case ID</th>
                    <th>Patient</th>
                    <th>Presenting Complaint</th>
                    <th>Confidence</th>
                    <th>Status</th>
                    <th>Date</th>
                    {isSuperAdmin && <th>Assigned To</th>}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.case_id}>
                      <td className="font-mono" style={{ fontSize: 11.5, color: 'var(--text3)' }}>{c.case_id.slice(0, 8)}</td>
                      <td>
                        <span style={{ fontWeight: 500 }}>{c.age ? `${c.age}y` : '—'}</span>{' '}
                        <span style={{ color: 'var(--text2)' }}>{c.sex || ''}</span>
                      </td>
                      <td style={{ maxWidth: 260 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.presenting_complaint || '—'}
                        </div>
                      </td>
                      <td><ConfBadge val={c.confidence_level} /></td>
                      <td><StatusBadge c={c} /></td>
                      <td style={{ color: 'var(--text2)' }}>{new Date(c.created_at).toLocaleDateString()}</td>
                      {isSuperAdmin && (
                        <td>
                          <select
                            className="form-input"
                            style={{ fontSize: 12, padding: '4px 8px', width: 150 }}
                            value={c.assigned_to || ''}
                            disabled={assigningId === c.case_id}
                            onChange={e => assignCase(c.case_id, e.target.value)}
                          >
                            <option value="">{c.assigned_to_name ? c.assigned_to_name : 'Unassigned'}</option>
                            {doctors.filter(d => d.email !== c.assigned_to).map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                        </td>
                      )}
                      <td>
                        <button className="table-action" onClick={() => navigate(`/cases/${c.case_id}`)}>
                          Open →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ConfBadge({ val }) {
  if (!val) return <span className="badge badge-neutral">—</span>
  const map = { high: 'badge-success', moderate: 'badge-warning', low: 'badge-danger' }
  return <span className={`badge ${map[val] || 'badge-neutral'}`}>{val}</span>
}

function StatusBadge({ c }) {
  if (c.emergency_detected) return <span className="badge badge-danger" style={{ display:'inline-flex',alignItems:'center',gap:4 }}><ShieldAlert size={11} /> Emergency</span>
  if (c.requires_urgent_review) return <span className="badge badge-danger" style={{ display:'inline-flex',alignItems:'center',gap:4 }}><AlertTriangle size={11} /> Urgent</span>
  if (c.approved) return <span className="badge badge-success" style={{ display:'inline-flex',alignItems:'center',gap:4 }}><CheckCircle size={11} /> Approved</span>
  return <span className="badge badge-warning" style={{ display:'inline-flex',alignItems:'center',gap:4 }}><Clock size={11} /> Pending</span>
}
