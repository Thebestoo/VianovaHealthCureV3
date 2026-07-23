import React, { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  LayoutDashboard, PlusCircle, BarChart2,
  ShieldCheck, Stethoscope, LogOut,
  Users, LogIn, Menu, X, CalendarDays, AlertOctagon, Users2,
  Receipt, Settings, MessageSquare, Radio,
  Search, Phone, Bell, Package, ChevronDown, ClipboardList, FileSearch
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'
import FloatingChat from './FloatingChat.jsx'

// Cases newly assigned to the signed-in doctor are toasted once, then remembered
// here so a page refresh or repeat poll doesn't re-notify for the same assignment.
const LS_SEEN_ASSIGNED = 'vnh_seen_assigned_cases'
function readSeenAssigned() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_SEEN_ASSIGNED) || '[]')) } catch { return new Set() }
}
function writeSeenAssigned(set) {
  localStorage.setItem(LS_SEEN_ASSIGNED, JSON.stringify([...set]))
}

// Nav structure mirrors the reference dashboard's sidebar (flat items, a few with
// expandable sub-items) — every existing page keeps its own route/content unchanged,
// this only reorganizes how they're reached from the sidebar.
const NAV_GROUPS = [
  {
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
      {
        label: 'Patients', icon: Users, path: '/patients',
        children: [
          { label: 'All Patients', path: '/patients'                },
          { label: 'My Patients',  path: '/patients?view=mine'       },
          { label: 'My Call List', path: '/patients?view=call-list'  },
          { label: 'My Caseload',  path: '/patients?view=caseload'   },
        ],
      },
      { label: 'Cases',         icon: ClipboardList, path: '/cases'          },
      { label: 'Chats',         icon: MessageSquare, path: '/channels'       },
      { label: 'Calls',         icon: Phone,         path: '/calls'          },
      { label: 'Clinical Notes',icon: FileSearch,    path: '/nlp-notes'      },
      { label: 'Alerts',        icon: Bell,          path: '/adverse-events' },
      { label: 'Appointments',  icon: CalendarDays,  path: '/appointments'   },
      {
        label: 'Onboarding', icon: PlusCircle, path: '/cases/new',
        children: [
          { label: 'New Case', path: '/cases/new' },
          { label: 'Consent',  path: '/consent'    },
        ],
      },
      { label: 'Billing & Coding', icon: Receipt, path: '/billing' },
      {
        label: 'Reports', icon: BarChart2, path: '/logs',
        children: [
          { label: 'Logs & Analytics',  path: '/logs'             },
          { label: 'Audit & Compliance',path: '/audit-compliance' },
          { label: 'Interoperability',  path: '/interoperability' },
          { label: 'Care Gaps',         path: '/care-gaps'        },
        ],
      },
      { label: 'Lab Results', icon: Package, path: '/labs' },
      {
        label: 'RPM Monitoring', icon: Radio, path: '/rpm',
        children: [
          { label: 'RPM Enrollment', path: '/rpm' },
          { label: 'CCM Enrollment', path: '/ccm' },
        ],
      },
      {
        label: 'Population Health', icon: Users2, path: '/population-health',
        children: [
          { label: 'Population Health',  path: '/population-health'  },
          { label: 'Chronic Disease',    path: '/chronic-disease'    },
          { label: 'Clinical Decisions', path: '/clinical-decisions' },
          { label: 'SDOH',               path: '/sdoh'               },
        ],
      },
      { label: 'Discharge Planning', icon: AlertOctagon, path: '/discharge' },
    ],
  },
]

const NAV_ALL   = NAV_GROUPS
const NAV_ADMIN = NAV_GROUPS.map(g => ({ ...g, items: [...g.items, { label: 'Admin', icon: ShieldCheck, path: '/admin' }] }))

// Bottom tab bar shows only the most important 5 items on mobile
const BOTTOM_NAV = [
  { label: 'Home',     icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Patients', icon: Users,           path: '/patients' },
  { label: 'Chats',    icon: MessageSquare,   path: '/channels' },
  { label: 'Appts',    icon: CalendarDays,    path: '/appointments' },
  { label: 'Reports',  icon: BarChart2,       path: '/logs' },
]

export default function Layout({ children }) {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const { key, role, label, email, avatar, disconnect, setAvatar } = useKey()
  const [menuOpen,     setMenuOpen]     = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [expandedNav,  setExpandedNav]  = useState(() => new Set())
  const fileRef = useRef(null)
  const seenAssignedRef = useRef(null)

  // Let ESC close whichever overlay is open (profile modal, mobile drawer) —
  // mobile users especially have no click-outside affordance while scrolled.
  useEffect(() => {
    if (!settingsOpen && !menuOpen && !profileMenuOpen) return
    function onKeyDown(e) {
      if (e.key === 'Escape') { setSettingsOpen(false); setMenuOpen(false); setProfileMenuOpen(false) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [settingsOpen, menuOpen, profileMenuOpen])

  // Poll for cases newly assigned to this doctor and toast a link to open them.
  useEffect(() => {
    if (!key || role === 'superadmin') return
    if (!seenAssignedRef.current) seenAssignedRef.current = readSeenAssigned()

    async function checkAssignedCases() {
      try {
        const res = await fetch('/api/cases', { headers: { 'x-api-key': key } })
        const cases = await res.json()
        if (!Array.isArray(cases)) return
        const seen = seenAssignedRef.current
        for (const c of cases) {
          if (!c.assigned_to || c.assigned_to !== email) continue
          const seenKey = `${c.case_id}:${c.assigned_at}`
          if (seen.has(seenKey)) continue
          seen.add(seenKey)
          toast(t => (
            <span
              style={{ cursor: 'pointer' }}
              onClick={() => { toast.dismiss(t.id); navigate(`/cases/${c.case_id}`) }}
            >
              New Case Assigned to you →
            </span>
          ), { icon: '📋', duration: 6000 })
        }
        writeSeenAssigned(seen)
      } catch { /* silent — non-critical background poll */ }
    }

    checkAssignedCases()
    const interval = setInterval(checkAssignedCases, 8000)
    return () => clearInterval(interval)
  }, [key, role, email, navigate])

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

  // Most nav paths are plain pathnames, but a few (Patients sub-views) carry a
  // query string that selects a filtered view of the same route — those need an
  // exact pathname+search match so only the one active view lights up.
  const isActive = (path) => {
    if (path.includes('?')) return pathname + search === path
    if (pathname === path) return !search
    return path !== '/dashboard' && pathname.startsWith(path)
  }

  function toggleNavExpand(path) {
    setExpandedNav(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  return (
    <div className="layout">
      {/* ── Desktop sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src="/vianova-logo.svg" alt="Vianova Health" style={{ height: 24, width: 'auto', display: 'block' }} />
          <div className="tagline" style={{ marginTop: 6 }}>Cure Analyzer System</div>
        </div>

        <nav className="sidebar-nav">
          {NAV_GROUPS_ACTIVE.map((group, gi) => (
            <div key={gi}>
              {group.title && (
                <div style={{
                  padding: '14px 16px 6px',
                  fontSize: 10, fontWeight: 700,
                  color: 'var(--text3)',
                  textTransform: 'uppercase',
                  letterSpacing: '.1em',
                  ...(gi > 0 && { borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 16 }),
                }}>
                  {group.title}
                </div>
              )}
              {group.items.map(({ label: lbl, icon: Icon, path, children }) => {
                const childActive = children?.some(c => isActive(c.path))
                const active = isActive(path) || childActive
                const open = children && (expandedNav.has(path) || childActive)
                return (
                  <div key={path}>
                    <button className={`nav-item ${active ? 'active' : ''}`}
                      onClick={() => children ? toggleNavExpand(path) : navigate(path)}>
                      {active && <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 20, background: 'var(--primary)', borderRadius: '0 3px 3px 0', opacity: .9 }} />}
                      <Icon size={16} />{lbl}
                      {children && <ChevronDown size={14} style={{ marginLeft: 'auto', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }} />}
                    </button>
                    {open && (
                      <div style={{ margin: '2px 0 4px 30px', borderLeft: '1px solid var(--border)', paddingLeft: 10 }}>
                        {children.map(c => (
                          <button key={c.label} className={`nav-item nav-item-sub ${isActive(c.path) ? 'active' : ''}`} onClick={() => navigate(c.path)}>
                            {c.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
            <ShieldCheck size={13} color="var(--text3)" />
            <p>AI draft — physician review required</p>
          </div>
          <p>v2.0 · llama-3.3-70b</p>
        </div>
      </aside>

      {/* ── Mobile top header ── */}
      <header className="mobile-header">
        <img src="/vianova-logo.svg" alt="Vianova Health" style={{ height: 20, width: 'auto', display: 'block' }} />
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
                {group.items.map(({ label: lbl, icon: Icon, path, children }) => {
                  const childActive = children?.some(c => isActive(c.path))
                  const active = isActive(path) || childActive
                  const open = children && (expandedNav.has(path) || childActive)
                  return (
                    <div key={path}>
                      <button className={`nav-item-mobile ${active ? 'active' : ''}`}
                        onClick={() => children ? toggleNavExpand(path) : navTo(path)}>
                        <Icon size={18} />{lbl}
                        {children && <ChevronDown size={15} style={{ marginLeft: 'auto', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />}
                      </button>
                      {open && children.map(c => (
                        <button key={c.label} className={`nav-item-mobile nav-item-sub ${isActive(c.path) ? 'active' : ''}`}
                          style={{ paddingLeft: 40 }} onClick={() => navTo(c.path)}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            ))}
          </nav>
        </div>
      )}

      {/* ── Main content ── */}
      <main className="main-content">
        <div className="global-topbar">
          <div className="global-search">
            <Search size={15} color="var(--text3)" />
            <input placeholder="Search patients, cases, appointments…" onKeyDown={e => {
              if (e.key !== 'Enter') return
              const q = e.currentTarget.value.trim()
              if (q) navigate(`/patients?q=${encodeURIComponent(q)}`)
            }} />
          </div>
          <div className="global-topbar-right">
            <button className="icon-btn" title="Calls" onClick={() => navigate('/calls')}><Phone size={16} /></button>
            <button className="icon-btn" title="Team" onClick={() => navigate('/patients')}><Users2 size={16} /></button>
            <div className="global-topbar-divider" />
            <div style={{ position: 'relative' }}>
              <button className="global-avatar" onClick={() => isConnected ? setProfileMenuOpen(o => !o) : navigate('/login')} title={isConnected ? 'Account' : 'Sign in'}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: isSuperAdmin ? 'var(--primary)' : 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                  {avatar
                    ? <img src={avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (isSuperAdmin ? <ShieldCheck size={14} color="#fff" /> : <Stethoscope size={14} color="#fff" />)
                  }
                </div>
                {isConnected ? (
                  <>
                    <span className="global-avatar-name">{label}</span>
                    <ChevronDown size={14} color="var(--text3)" style={{ transform: profileMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                  </>
                ) : (
                  <span className="global-avatar-name">Sign In</span>
                )}
              </button>

              {profileMenuOpen && isConnected && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setProfileMenuOpen(false)} />
                  <div className="card animate-fade-in" style={{ position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 250, padding: 0, zIndex: 1000, boxShadow: '0 16px 40px rgba(0,0,0,.16)' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 38, height: 38, borderRadius: '50%', background: isSuperAdmin ? 'var(--primary)' : 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                        {avatar
                          ? <img src={avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : (isSuperAdmin ? <ShieldCheck size={16} color="#fff" /> : <Stethoscope size={16} color="#fff" />)
                        }
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</div>
                      </div>
                    </div>
                    <div style={{ padding: '6px' }}>
                      <button onClick={() => { setProfileMenuOpen(false); setSettingsOpen(true) }}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', background: 'none', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, color: 'var(--text)', textAlign: 'left' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        <Settings size={14} color="var(--text2)" /> Account Settings
                      </button>
                      <button onClick={() => { setProfileMenuOpen(false); handleDisconnect() }}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', background: 'none', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, color: 'var(--danger)', textAlign: 'left' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--danger-light)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        <LogOut size={14} /> Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
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

      {!pathname.startsWith('/channels') && !pathname.startsWith('/ccm') && !pathname.startsWith('/rpm') && <FloatingChat />}

      {/* ── Profile Settings Modal ── */}
      {settingsOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => e.target === e.currentTarget && setSettingsOpen(false)}>
          <div className="card" style={{ padding: 0, width: 340, boxShadow: '0 24px 64px rgba(0,0,0,.2)', animation: 'modalIn .2s ease', border: 'none' }}>
            <div className="card-header">
              <span className="card-title">Profile Settings</span>
              <button onClick={() => setSettingsOpen(false)} className="icon-btn" style={{ borderRadius: '50%', border: 'none', background: 'var(--surface2)' }}>
                <X size={15} />
              </button>
            </div>

            <div className="card-body">
              {/* Avatar preview + upload */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 22 }}>
                <div style={{ position: 'relative' }}>
                  <div style={{ width: 90, height: 90, borderRadius: '50%', background: isSuperAdmin ? 'var(--primary)' : 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '3px solid var(--border)', boxShadow: '0 4px 16px rgba(0,0,0,.1)' }}>
                    {avatar
                      ? <img src={avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 36, fontWeight: 800, color: '#fff' }}>{(label || '?').charAt(0).toUpperCase()}</span>
                    }
                  </div>
                  <button onClick={() => fileRef.current?.click()} style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: '50%', background: 'var(--primary)', border: '2px solid #fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  </button>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', textTransform: 'capitalize' }}>{role?.replace('superadmin', 'Super Admin')}</div>
                </div>
              </div>

              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />

              <button onClick={() => fileRef.current?.click()} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}>
                Upload Photo
              </button>
              {avatar && (
                <button onClick={() => { setAvatar(''); setSettingsOpen(false) }} className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', color: 'var(--danger)' }}>
                  Remove Photo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes modalIn { from { opacity:0; transform:scale(.95) } to { opacity:1; transform:scale(1) } }`}</style>
    </div>
  )
}
