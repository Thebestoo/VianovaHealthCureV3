import React, { useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FolderOpen, PlusCircle, BarChart2,
  HeartPulse, ShieldCheck, Stethoscope, LogOut, Wifi, WifiOff,
  Users, LogIn, Menu, X, AlertCircle, FlaskConical, CalendarDays,
  ClipboardList, ShieldAlert, AlertOctagon, Users2, FileText,
  Lightbulb, Home, Activity, GitMerge, ClipboardCheck,
  Receipt, Settings
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'
import FloatingChat from './FloatingChat.jsx'

const NAV_GROUPS = [
  {
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
      { label: 'Patients',  icon: Users,           path: '/patients'  },
      { label: 'All Cases', icon: FolderOpen,      path: '/cases'     },
      { label: 'New Case',  icon: PlusCircle,      path: '/cases/new' },
    ],
  },
  {
    title: 'Clinical Workflow',
    items: [
      { label: 'Care Gaps',      icon: AlertCircle,  path: '/care-gaps'    },
      { label: 'Lab Results',    icon: FlaskConical, path: '/labs'         },
      { label: 'Appointments',   icon: CalendarDays, path: '/appointments' },
      { label: 'Discharge',      icon: ClipboardList,path: '/discharge'    },
      { label: 'Consent',        icon: ShieldAlert,  path: '/consent'      },
      { label: 'Adverse Events', icon: AlertOctagon, path: '/adverse-events' },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { label: 'Population Health',  icon: Users2,       path: '/population-health'  },
      { label: 'NLP Notes',          icon: FileText,     path: '/nlp-notes'          },
      { label: 'Clinical Decisions', icon: Lightbulb,    path: '/clinical-decisions' },
      { label: 'SDOH',               icon: Home,         path: '/sdoh'               },
      { label: 'Chronic Disease',    icon: Activity,     path: '/chronic-disease'    },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Interoperability',  icon: GitMerge,      path: '/interoperability'  },
      { label: 'Audit & Compliance',icon: ClipboardCheck,path: '/audit-compliance'  },
      { label: 'Billing & Coding',  icon: Receipt,       path: '/billing'           },
      { label: 'Logs & Analytics',  icon: BarChart2,     path: '/logs'              },
    ],
  },
]

const NAV_ALL   = NAV_GROUPS
const NAV_ADMIN = [
  ...NAV_GROUPS.slice(0, -1),
  {
    title: 'Operations',
    items: [
      ...NAV_GROUPS[3].items,
      { label: 'Admin', icon: ShieldCheck, path: '/admin' },
    ],
  },
]

// Bottom tab bar shows only the most important 5 items on mobile
const BOTTOM_NAV = [
  { label: 'Home',     icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Patients', icon: Users,           path: '/patients' },
  { label: 'Cases',    icon: FolderOpen,      path: '/cases' },
  { label: 'New',      icon: PlusCircle,      path: '/cases/new' },
  { label: 'Logs',     icon: BarChart2,       path: '/logs' },
]

export default function Layout({ children }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { key, role, label, avatar, stats, disconnect, setAvatar } = useKey()
  const [menuOpen,     setMenuOpen]     = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const fileRef = useRef(null)

  function handleAvatarUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    // reset so re-selecting same file fires onChange again
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = ev => {
      const img = new Image()
      img.onload = () => {
        // resize to max 200×200 and compress to keep well under localStorage limit
        const MAX = 200
        const scale = Math.min(1, MAX / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width  = Math.round(img.width  * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
        try {
          setAvatar(dataUrl)
        } catch {
          alert('Image too large — please pick a smaller photo.')
        }
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  }

  const isConnected  = !!key
  const isSuperAdmin = role === 'superadmin'
  const NAV_GROUPS_ACTIVE = isSuperAdmin ? NAV_ADMIN : NAV_ALL
  const NAV_FLAT     = NAV_GROUPS_ACTIVE.flatMap(g => g.items)
  const BOTTOM       = isSuperAdmin ? [...BOTTOM_NAV, { label: 'Admin', icon: ShieldCheck, path: '/admin' }] : BOTTOM_NAV

  function handleDisconnect() {
    disconnect()
    navigate('/login', { replace: true })
    setMenuOpen(false)
  }

  function navTo(path) {
    navigate(path)
    setMenuOpen(false)
  }

  const isActive = (path) =>
    pathname === path || (path !== '/dashboard' && pathname.startsWith(path))

  return (
    <div className="layout">
      {/* ── Desktop sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <img src="/vianova-logo.svg" alt="Vianova Health" style={{ height: 26, width: 'auto' }} />
            <div className="tagline">Cure Analyzer System</div>
          </div>
        </div>

        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.1)' }}>
          {isConnected ? (
            <div style={{ background: 'rgba(255,255,255,.1)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Wifi size={13} color="#4ade80" />
                  <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Connected</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button onClick={() => setSettingsOpen(true)} title="Profile Settings"
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', cursor: 'pointer', padding: 2 }}>
                    <Settings size={13} />
                  </button>
                  <button onClick={handleDisconnect} title="Sign Out"
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', cursor: 'pointer', padding: 2 }}>
                    <LogOut size={13} />
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                {/* Avatar — photo if set, otherwise icon */}
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: isSuperAdmin ? 'rgba(14,116,144,.7)' : 'rgba(5,150,105,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', cursor: 'pointer' }}
                  onClick={() => setSettingsOpen(true)} title="Change photo">
                  {avatar
                    ? <img src={avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (isSuperAdmin ? <ShieldCheck size={14} color="#fff" /> : <Stethoscope size={14} color="#fff" />)
                  }
                </div>
                <div>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 13, lineHeight: 1.2 }}>{label}</div>
                  <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>{isSuperAdmin ? 'Super Admin' : 'Doctor'}</div>
                </div>
              </div>
              {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginTop: 10 }}>
                  {[
                    { label: 'Cases',     value: stats.total     },
                    { label: 'Pending',   value: stats.pending   },
                    { label: 'Approved',  value: stats.approved  },
                    { label: 'Emergency', value: stats.emergency },
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
              <button onClick={() => navigate('/login')}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 7, background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <LogIn size={13} /> Sign In
              </button>
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          {NAV_GROUPS_ACTIVE.map((group, gi) => (
            <div key={gi}>
              {group.title && (
                <div style={{
                  padding: '14px 16px 6px',
                  fontSize: 10, fontWeight: 700,
                  color: 'rgba(255,255,255,.3)',
                  textTransform: 'uppercase',
                  letterSpacing: '.1em',
                  ...(gi > 0 && { borderTop: '1px solid rgba(255,255,255,.08)', marginTop: 4, paddingTop: 16 }),
                }}>
                  {group.title}
                </div>
              )}
              {group.items.map(({ label: lbl, icon: Icon, path }) => (
                <button key={path} className={`nav-item ${isActive(path) ? 'active' : ''}`} onClick={() => navigate(path)}>
                  {isActive(path) && <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 20, background: '#fff', borderRadius: '0 3px 3px 0', opacity: .9 }} />}
                  <Icon size={16} />{lbl}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
            <ShieldCheck size={13} color="rgba(255,255,255,.45)" />
            <p>AI draft — physician review required</p>
          </div>
          <p>v2.0 · llama-3.3-70b</p>
        </div>
      </aside>

      {/* ── Mobile top header ── */}
      <header className="mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <HeartPulse size={20} color="var(--primary)" />
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Vianova Health</span>
        </div>
        <button className="mobile-menu-btn" onClick={() => setMenuOpen(o => !o)}>
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {/* ── Mobile slide-down menu ── */}
      {menuOpen && (
        <div className="mobile-drawer">
          {/* user info */}
          {isConnected ? (
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 99, background: isSuperAdmin ? 'var(--primary)' : 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isSuperAdmin ? <ShieldCheck size={16} color="#fff" /> : <Stethoscope size={16} color="#fff" />}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{isSuperAdmin ? 'Super Admin' : 'Doctor'}</div>
                </div>
              </div>
              <button onClick={handleDisconnect} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <LogOut size={13} /> Sign Out
              </button>
            </div>
          ) : (
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
              <button onClick={() => navTo('/login')} className="btn btn-primary w-full" style={{ justifyContent: 'center' }}>
                <LogIn size={14} /> Sign In
              </button>
            </div>
          )}
          {/* nav links */}
          <nav style={{ padding: '10px 12px' }}>
            {NAV_GROUPS_ACTIVE.map((group, gi) => (
              <div key={gi}>
                {group.title && (
                  <div style={{
                    padding: '10px 8px 4px',
                    fontSize: 10, fontWeight: 700,
                    color: 'var(--text2)',
                    textTransform: 'uppercase',
                    letterSpacing: '.1em',
                    ...(gi > 0 && { borderTop: '1px solid var(--border)', marginTop: 4 }),
                  }}>
                    {group.title}
                  </div>
                )}
                {group.items.map(({ label: lbl, icon: Icon, path }) => (
                  <button key={path} className={`nav-item-mobile ${isActive(path) ? 'active' : ''}`} onClick={() => navTo(path)}>
                    <Icon size={18} />{lbl}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </div>
      )}

      {/* ── Main content ── */}
      <main className="main-content">
        {children}
      </main>

      {/* ── Mobile bottom tab bar ── */}
      <nav className="mobile-bottom-nav">
        {BOTTOM.map(({ label: lbl, icon: Icon, path }) => (
          <button key={path} className={`bottom-tab ${isActive(path) ? 'active' : ''}`} onClick={() => navigate(path)}>
            <Icon size={20} />
            <span>{lbl}</span>
          </button>
        ))}
      </nav>

      <FloatingChat />

      {/* ── Profile Settings Modal ── */}
      {settingsOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => e.target === e.currentTarget && setSettingsOpen(false)}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 28, width: 340, boxShadow: '0 24px 64px rgba(0,0,0,.25)', animation: 'modalIn .2s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
              <div style={{ fontWeight: 700, fontSize: 17, color: '#0f172a' }}>Profile Settings</div>
              <button onClick={() => setSettingsOpen(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={15} color="#64748b" />
              </button>
            </div>

            {/* Avatar preview + upload */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 24 }}>
              <div style={{ position: 'relative' }}>
                <div style={{ width: 90, height: 90, borderRadius: '50%', background: isSuperAdmin ? '#0e7490' : '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '3px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,.12)' }}>
                  {avatar
                    ? <img src={avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 36, fontWeight: 800, color: '#fff' }}>{(label || '?').charAt(0).toUpperCase()}</span>
                  }
                </div>
                <button onClick={() => fileRef.current?.click()} style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: '50%', background: '#1d6ef5', border: '2px solid #fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </button>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: '#0f172a' }}>{label}</div>
                <div style={{ fontSize: 12, color: '#64748b', textTransform: 'capitalize' }}>{role?.replace('superadmin', 'Super Admin')}</div>
              </div>
            </div>

            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />

            <button onClick={() => fileRef.current?.click()} style={{ width: '100%', padding: '11px 0', borderRadius: 12, background: 'linear-gradient(135deg,#1d6ef5,#0ea5e9)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 10 }}>
              Upload Photo
            </button>
            {avatar && (
              <button onClick={() => { setAvatar(''); setSettingsOpen(false) }} style={{ width: '100%', padding: '10px 0', borderRadius: 12, background: '#fff', border: '1.5px solid #e2e8f0', color: '#ef4444', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                Remove Photo
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes modalIn { from { opacity:0; transform:scale(.95) } to { opacity:1; transform:scale(1) } }`}</style>
    </div>
  )
}
