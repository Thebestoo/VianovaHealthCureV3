import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FolderOpen, PlusCircle, BarChart2,
  HeartPulse, ShieldCheck, Stethoscope, LogOut, Wifi, WifiOff,
  Users, LogIn
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

const NAV_ALL = [
  { label: 'Dashboard',        icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Patients',         icon: Users,           path: '/patients' },
  { label: 'All Cases',        icon: FolderOpen,      path: '/cases' },
  { label: 'New Case',         icon: PlusCircle,      path: '/cases/new' },
{ label: 'Logs & Analytics', icon: BarChart2,       path: '/logs' },
]
const NAV_ADMIN = [
  ...NAV_ALL,
  { label: 'Admin',            icon: ShieldCheck,     path: '/admin' },
]

export default function Layout({ children }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { key, role, label, stats, disconnect } = useKey()

  const isConnected  = !!key
  const isSuperAdmin = role === 'superadmin'
  const NAV          = isSuperAdmin ? NAV_ADMIN : NAV_ALL

  function handleDisconnect() {
    disconnect()
    navigate('/login', { replace: true })
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        {/* logo */}
        <div className="sidebar-logo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <HeartPulse size={22} color="#fff" />
            <div>
              <div className="brand">Vianova Health</div>
              <div className="tagline">Cure Analyzer System</div>
            </div>
          </div>
        </div>

        {/* connection badge */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.1)' }}>
          {isConnected ? (
            <div style={{ background: 'rgba(255,255,255,.1)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Wifi size={13} color="#4ade80" />
                  <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Connected</span>
                </div>
                <button
                  onClick={handleDisconnect}
                  title="Sign Out"
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', cursor: 'pointer', padding: 2 }}
                >
                  <LogOut size={13} />
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 99,
                  background: isSuperAdmin ? 'rgba(14,116,144,.7)' : 'rgba(5,150,105,.7)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  {isSuperAdmin ? <ShieldCheck size={13} color="#fff" /> : <Stethoscope size={13} color="#fff" />}
                </div>
                <div>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 13, lineHeight: 1.2 }}>{label}</div>
                  <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>{isSuperAdmin ? 'Super Admin' : 'Doctor'}</div>
                </div>
              </div>
              {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginTop: 10 }}>
                  {[
                    { label: 'Cases',    value: stats.total    },
                    { label: 'Pending',  value: stats.pending  },
                    { label: 'Approved', value: stats.approved },
                    { label: 'Emergency',value: stats.emergency},
                  ].map(s => (
                    <div key={s.label} style={{ background: 'rgba(0,0,0,.15)', borderRadius: 7, padding: '6px 8px', textAlign: 'center' }}>
                      <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{s.value}</div>
                      <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 10 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ background: 'rgba(255,255,255,.06)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <WifiOff size={14} color="rgba(255,255,255,.35)" />
                <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, fontWeight: 500 }}>Not signed in</div>
              </div>
              <button
                onClick={() => navigate('/login')}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 7,
                  background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.2)',
                  color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <LogIn size={13} /> Sign In
              </button>
            </div>
          )}
        </div>

        {/* nav */}
        <nav className="sidebar-nav">
          {NAV.map(({ label: lbl, icon: Icon, path }) => (
            <button
              key={path}
              className={`nav-item ${pathname === path || (path !== '/dashboard' && pathname.startsWith(path)) ? 'active' : ''}`}
              onClick={() => navigate(path)}
            >
              <Icon size={16} />
              {lbl}
            </button>
          ))}
        </nav>

        {/* footer */}
        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
            <ShieldCheck size={13} color="rgba(255,255,255,.45)" />
            <p>AI draft — physician review required</p>
          </div>
          <p>v1.0 · llama-3.3-70b</p>
        </div>
      </aside>

      <main className="main-content">{children}</main>
    </div>
  )
}
