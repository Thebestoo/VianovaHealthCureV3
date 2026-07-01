import React, { useState, useEffect, useRef, useCallback, memo } from 'react'
import { MessageCircle, X, Home, MessageSquare, Ticket, Send, Check, XCircle,
         ArrowRight, ChevronDown, Clock, CheckCircle, AlertCircle, BookOpen, PhoneOff,
         AlertTriangle, Ban, HandMetal, ShieldAlert, Lock } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

/* ─── helpers ────────────────────────────────────────────────────── */
const fmtTime = ts => new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
const fmtDate = ts => {
  const d = new Date(ts)
  if (d.toDateString() === new Date().toDateString()) return fmtTime(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/* ─── Profanity filter ───────────────────────────────────────────── */
const BAD_WORDS = [
  'fuck','fucker','fucking','fucked','fucks','motherfucker','motherfucking',
  'shit','shitting','shithead','bullshit','horseshit',
  'bitch','bitches','bitching',
  'cunt','cunts',
  'pussy','pussies',
  'cock','cocks','cocksucker',
  'dick','dicks','dickhead',
  'ass','asshole','assholes','asswipe','asshat',
  'prick','pricks',
  'twat','twats',
  'whore','whores',
  'slut','sluts',
  'skank','skanks',
  'wanker','wank',
  'tit','tits','boob','boobs',
  'cum','jizz','dildo','porn','porno',
  'blowjob','handjob',
  'nigger','niggers','nigga','niggas',
  'faggot','faggots','fag','fags',
  'kike','kikes','spic','spics',
  'chink','chinks','gook','gooks',
  'wetback','wetbacks','cracker',
  'towelhead','sandnigger','coon',
  'beaner','zipperhead',
  'retard','retards','retarded',
  'cripple','cripples',
  'bastard','bastards',
  'jackass','jackasses',
  'dipshit','douchebag','douchebags',
  'scumbag','scumbags','shitbag',
  'dumbass','dumbasses',
  'moron','morons','idiot','idiots','imbecile',
  'pedo','pedophile','pedophiles',
  'pervert','perverts','perv',
  'predator','rapist','rapists',
  'incel','kys','thot','ho',
  'assclown','butthead','numbnuts','shitface',
  'twatwaffle','cumslut','whoreface',
  'bitchass','fuckface','fuckwit','fuckboy',
  'dicknose','shitposter','assbag',
  'jerkoff','jerkass','ballsack',
  'nutsack','taint','rimjob',
  'shitstain','pissbaby','crybaby',
  'redneck','hillbilly','trailer trash',
  'white trash','ghetto','thug',
  'tranny','shemale',
  'dyke','lesbo',
  'mong','spaz','tard',
  'halfwit','dolt','dunce',
  'deadbeat','lowlife','scum',
  'vermin','parasite','cancer',
  'garbage','trash','filth',
  'fat pig','ugly','disgusting',
  'kill yourself','go die','drop dead',
  'i will kill','stfu','gtfo',
  'lmfao','wtf','omfg',
]
const hasProfanity = text => BAD_WORDS.some(w => new RegExp(`\\b${w}\\b`, 'i').test(text))
const TIMEOUT_MS = 15 * 60 * 1000 // 15 minute timeout after 3 strikes
const LS_TIMEOUT_KEY = 'vnh_chat_timeout_until'

function getStoredTimeoutSecsLeft() {
  const until = Number(localStorage.getItem(LS_TIMEOUT_KEY) || 0)
  if (!until) return 0
  const left = Math.ceil((until - Date.now()) / 1000)
  return left > 0 ? left : 0
}

function setStoredTimeout() {
  localStorage.setItem(LS_TIMEOUT_KEY, String(Date.now() + TIMEOUT_MS))
}

function clearStoredTimeout() {
  localStorage.removeItem(LS_TIMEOUT_KEY)
}

/* ─── Avatar ─────────────────────────────────────────────────────── */
const GRAD = {
  superadmin: 'linear-gradient(135deg,#1d6ef5,#38bdf8)',
  doctor:     'linear-gradient(135deg,#059669,#34d399)',
  nurse:      'linear-gradient(135deg,#d97706,#fbbf24)',
  default:    'linear-gradient(135deg,#7c3aed,#a78bfa)',
}
const Avatar = memo(function Avatar({ name, size = 36, role, src }) {
  if (src) return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: GRAD[role] || GRAD.default, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800, fontSize: Math.round(size * 0.4), color: '#fff' }}>
      {(name || '?')[0].toUpperCase()}
    </div>
  )
})

/* ─── InputBar ───────────────────────────────────────────────────── */
const InputBar = memo(function InputBar({ value, onChange, onSend, disabled, fwdRef, placeholder }) {
  return (
    <div style={{ padding: '10px 12px 14px', background: '#fff', borderTop: '1px solid #f1f5f9', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', borderRadius: 14, padding: '7px 8px 7px 14px', border: '1.5px solid #e2e8f0', transition: 'border-color .15s' }}
        onFocus={() => {}} onBlur={() => {}}>
        <input
          ref={fwdRef}
          value={value}
          onChange={onChange}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }}
          placeholder={placeholder || 'Type a message…'}
          disabled={disabled}
          autoComplete="off"
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13.5, color: '#1e293b', background: 'transparent', lineHeight: 1.4, fontFamily: 'inherit' }}
        />
        <button onClick={onSend} disabled={disabled || !value.trim()} style={{
          width: 34, height: 34, borderRadius: '50%', border: 'none', flexShrink: 0, cursor: disabled || !value.trim() ? 'default' : 'pointer',
          background: (!disabled && value.trim()) ? 'linear-gradient(135deg,#1d6ef5,#0ea5e9)' : '#e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s',
        }}><Send size={14} color="#fff" /></button>
      </div>
    </div>
  )
})

/* ─── Bubble ─────────────────────────────────────────────────────── */
const Bubble = memo(function Bubble({ msg, myEmail }) {
  const mine = msg.sender_email === myEmail
  if (msg.sender_role === 'system') {
    if (msg.sender_name === 'Vianova Support') {
      return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#fff', border: '1.5px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
            <img src="/vianova-logo.svg" alt="Vianova Health" style={{ width: 20, height: 'auto' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3, fontWeight: 600, letterSpacing: .3 }}>Vianova Support</div>
            <div style={{ background: '#f1f5f9', borderRadius: '3px 16px 16px 16px', padding: '11px 13px', fontSize: 13.5, lineHeight: 1.65, color: '#1e293b' }}>
              {msg.message.split('\n').map((l, i, a) => <span key={i}>{l}{i < a.length - 1 && <br />}</span>)}
            </div>
            <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 4 }}>{fmtTime(msg.created_at)}</div>
          </div>
        </div>
      )
    }
    const urgent  = msg.message.startsWith('[URGENT]')
    const closed  = msg.message.startsWith('[CLOSED]') || msg.message.includes('no longer needs assistance')
    const review  = msg.message.startsWith('[REVIEW]')
    const joined  = msg.message.startsWith('[JOINED]')
    const SysIcon = urgent ? AlertTriangle : closed ? Lock : review ? BookOpen : joined ? CheckCircle : null
    const sysColor = urgent ? '#dc2626' : closed ? '#64748b' : review ? '#7c3aed' : joined ? '#059669' : '#94a3b8'
    const sysBg    = urgent ? '#fef2f2' : closed ? '#f8fafc' : review ? '#faf5ff' : joined ? '#f0fdf4' : '#f1f5f9'
    const sysBorder = urgent ? '1px solid #fecaca' : closed ? '1px solid #e2e8f0' : review ? '1px solid #e9d5ff' : joined ? '1px solid #bbf7d0' : 'none'
    // strip the leading marker tag for display
    const displayText = msg.message.replace(/^\[(URGENT|CLOSED|REVIEW|JOINED)\]\s*/, '')
    return (
      <div style={{ textAlign: 'center', margin: '10px 0' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '5px 14px', borderRadius: 99, background: sysBg, color: sysColor, border: sysBorder, fontWeight: 500, fontStyle: (!urgent && !closed && !review && !joined) ? 'italic' : 'normal' }}>
          {SysIcon && <SysIcon size={11} strokeWidth={2.5} />}
          {displayText}
        </span>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 7, marginBottom: 12 }}>
      {!mine && <Avatar name={msg.sender_name} size={26} role={msg.sender_role} />}
      <div style={{ maxWidth: '74%' }}>
        {!mine && <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3, paddingLeft: 2, fontWeight: 600 }}>{msg.sender_name}</div>}
        <div style={{ padding: '9px 13px', fontSize: 13.5, lineHeight: 1.55, borderRadius: mine ? '16px 16px 3px 16px' : '3px 16px 16px 16px', background: mine ? 'linear-gradient(135deg,#1d6ef5,#0ea5e9)' : '#f1f5f9', color: mine ? '#fff' : '#1e293b', wordBreak: 'break-word' }}>
          {msg.message}
        </div>
        <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 3, textAlign: mine ? 'right' : 'left', paddingInline: 3 }}>{fmtTime(msg.created_at)}</div>
      </div>
    </div>
  )
})

/* ─── Blue gradient header (chat view) ──────────────────────────── */
const ChatHeader = memo(function ChatHeader({ name, subRole, onEnd, onReview, onClose, isAdmin }) {
  return (
    <div style={{ flexShrink: 0, background: 'linear-gradient(135deg,#1a65e8,#0ea5e9)' }}>
      <div style={{ padding: '10px 14px 0' }}>
        <img src="/vianova-logo.svg" alt="Vianova Health" style={{ height: 15, width: 'auto', filter: 'brightness(0) invert(1)', opacity: .9 }} />
      </div>
      <div style={{ padding: '10px 14px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <Avatar name={name} size={38} role={subRole} />
          <span style={{ position: 'absolute', bottom: 1, right: 1, width: 9, height: 9, background: '#22c55e', borderRadius: '50%', border: '2px solid #1a65e8' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'rgba(255,255,255,.65)', fontSize: 10.5 }}>Chat with</div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        </div>
        {isAdmin && (
          <button onClick={onReview} title="Send to review" style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', borderRadius: 8, padding: '5px 10px', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
            <BookOpen size={11} /> Review
          </button>
        )}
        <button onClick={onEnd} title="End chat" style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', borderRadius: 8, padding: '5px 10px', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>End</button>
        <button onClick={onClose} title="Minimise" style={{ background: 'rgba(255,255,255,.12)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ChevronDown size={16} color="#fff" />
        </button>
      </div>
      <svg viewBox="0 0 375 22" style={{ display: 'block', width: '100%' }}><path d="M0,8 C80,22 220,0 375,14 L375,22 L0,22 Z" fill="#fff" /></svg>
      <div style={{ background: '#fff', padding: '2px 14px 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
        <span style={{ fontSize: 11.5, color: '#64748b' }}>We are online</span>
      </div>
    </div>
  )
})

/* ─── Blue gradient header (home/tabs view) ──────────────────────── */
const HomeHeader = memo(function HomeHeader({ label, role, avatar, escalatedCount, onClose }) {
  return (
    <div style={{ flexShrink: 0, background: 'linear-gradient(135deg,#1a65e8,#0ea5e9)' }}>
      <div style={{ padding: '12px 14px 0' }}>
        <img src="/vianova-logo.svg" alt="Vianova Health" style={{ height: 15, width: 'auto', filter: 'brightness(0) invert(1)', opacity: .9 }} />
      </div>
      <div style={{ padding: '10px 14px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name={label} size={38} role={role} src={avatar || undefined} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'rgba(255,255,255,.65)', fontSize: 10.5 }}>Welcome back,</div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
        </div>
        {role === 'superadmin' && escalatedCount > 0 && (
          <span style={{ background: '#ef4444', color: '#fff', fontWeight: 800, fontSize: 11, padding: '2px 8px', borderRadius: 99, flexShrink: 0 }}>{escalatedCount} urgent</span>
        )}
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,.12)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <X size={15} color="#fff" />
        </button>
      </div>
      <svg viewBox="0 0 375 22" style={{ display: 'block', width: '100%' }}><path d="M0,8 C80,22 220,0 375,14 L375,22 L0,22 Z" fill="#fff" /></svg>
    </div>
  )
})

/* ─── TabBar ─────────────────────────────────────────────────────── */
const TabBar = memo(function TabBar({ tab, setTab, isSuperAdmin, escalatedCount }) {
  const tabs = isSuperAdmin
    ? [{ id: 'home', label: 'Home', Icon: Home }, { id: 'messages', label: 'Messages', Icon: MessageSquare }, { id: 'tickets', label: 'Tickets', Icon: Ticket, badge: escalatedCount }]
    : [{ id: 'home', label: 'Home', Icon: Home }, { id: 'messages', label: 'Messages', Icon: MessageSquare }]
  return (
    <div style={{ display: 'flex', borderTop: '1px solid #f1f5f9', background: '#fff', flexShrink: 0 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: '9px 0 7px', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: tab === t.id ? '#1d6ef5' : '#94a3b8', borderTop: `2px solid ${tab === t.id ? '#1d6ef5' : 'transparent'}`, fontSize: 10, fontWeight: tab === t.id ? 700 : 400, position: 'relative', transition: 'color .15s' }}>
          <t.Icon size={17} strokeWidth={tab === t.id ? 2.3 : 1.7} />
          {t.label}
          {t.badge > 0 && <span style={{ position: 'absolute', top: 5, left: '50%', marginLeft: 5, background: '#ef4444', color: '#fff', borderRadius: 99, fontSize: 9, fontWeight: 800, padding: '0 4px', lineHeight: '13px' }}>{t.badge}</span>}
        </button>
      ))}
    </div>
  )
})

/* ─── HomeTab ────────────────────────────────────────────────────── */
const HomeTab = memo(function HomeTab({ role, escalatedCount, hasActiveSession, onNewChat, onGoMessages, onGoTickets, starting, history, onViewHistory }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button onClick={onNewChat} disabled={starting} style={{ borderRadius: 14, padding: '16px 18px', background: 'linear-gradient(135deg,#1a65e8,#7c3aed)', border: 'none', cursor: starting ? 'default' : 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, opacity: starting ? .7 : 1, boxShadow: '0 4px 20px rgba(26,101,232,.3)' }}>
        <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {starting ? <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,.4)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'fc-spin 1s linear infinite' }} /> : <MessageSquare size={20} color="#fff" />}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, marginBottom: 2 }}>New Message</div>
          <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 12 }}>{starting ? 'Opening…' : 'Start a conversation'}</div>
        </div>
        <ArrowRight size={16} color="rgba(255,255,255,.6)" />
      </button>

      <div style={{ borderRadius: 12, padding: '12px 14px', border: '1.5px solid #bbf7d0', background: '#f0fdf4', display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: '#fff', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
          <img src="/vianova-logo.svg" alt="Vianova Health" style={{ width: 20, height: 'auto' }} />
        </div>
        <div>
          <div style={{ color: '#047857', fontWeight: 700, fontSize: 12.5 }}>All Systems Operational</div>
          <div style={{ color: '#6b7280', fontSize: 11, marginTop: 1 }}>Vianova Health Platform</div>
        </div>
      </div>

      <button onClick={() => window.open('https://github.com/Thebestoo/VianovaHealthCureV3', '_blank')} style={{ borderRadius: 12, padding: '12px 16px', border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, fontSize: 13.5, color: '#0f172a' }}>Documentation</span>
        <svg width="14" height="14" fill="none" stroke="#94a3b8" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
      </button>

      {role === 'superadmin' && escalatedCount > 0 && (
        <button onClick={onGoTickets} style={{ borderRadius: 12, padding: '12px 14px', border: '1.5px solid #fecaca', background: '#fff7f7', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11 }}>
          <span style={{ background: '#ef4444', color: '#fff', fontWeight: 800, fontSize: 13, width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{escalatedCount}</span>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#dc2626' }}>Urgent admin requests</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>Tap to review</div>
          </div>
          <ArrowRight size={15} color="#ef4444" />
        </button>
      )}

      {hasActiveSession && (
        <button onClick={onGoMessages} style={{ borderRadius: 12, padding: '12px 14px', border: '1.5px solid #bfdbfe', background: '#eff6ff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#1d6ef5,#0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MessageSquare size={14} color="#fff" />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#1d6ef5' }}>Resume chat</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>You have an ongoing conversation</div>
          </div>
          <ArrowRight size={15} color="#1d6ef5" />
        </button>
      )}

      {history && history.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6, paddingLeft: 2 }}>Recent chats</div>
          {history.slice(0, 3).map(s => (
            <button key={s.id} onClick={() => onViewHistory(s)} style={{ width: '100%', borderRadius: 11, padding: '10px 12px', border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, textAlign: 'left' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <XCircle size={13} color="#94a3b8" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0f172a' }}>{fmtDate(s.created_at)}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{s.msg_count > 0 ? `${s.msg_count} message${s.msg_count > 1 ? 's' : ''}` : 'No messages'}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#f8fafc', color: '#94a3b8', border: '1px solid #e2e8f0', flexShrink: 0 }}>Closed</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
})

/* ─── Status badge config ────────────────────────────────────────── */
const STATUS_STYLE = {
  open:      { bg: '#eff6ff', color: '#1d6ef5', border: '#bfdbfe', label: 'Open',     Icon: Clock },
  escalated: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', label: 'Urgent',   Icon: AlertCircle },
  active:    { bg: '#f0fdf4', color: '#059669', border: '#bbf7d0', label: 'Active',   Icon: CheckCircle },
  closed:    { bg: '#f8fafc', color: '#94a3b8', border: '#e2e8f0', label: 'Closed',   Icon: XCircle },
  reviewed:  { bg: '#faf5ff', color: '#7c3aed', border: '#e9d5ff', label: 'Reviewed', Icon: BookOpen },
}

/* ─── TicketsTab ─────────────────────────────────────────────────── */
const TicketsTab = memo(function TicketsTab({ tickets, onAccept, onDecline, onOpen, onCloseTicket, filter, setFilter }) {
  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter)
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '8px 12px 4px', display: 'flex', gap: 5, flexShrink: 0, overflowX: 'auto' }}>
        {['all', 'escalated', 'active', 'open', 'closed'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '3px 10px', borderRadius: 99, border: `1px solid ${filter === f ? '#1d6ef5' : '#e2e8f0'}`, background: filter === f ? '#1d6ef5' : '#fff', color: filter === f ? '#fff' : '#64748b', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0, textTransform: 'capitalize', transition: 'all .15s' }}>
            {f}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px 10px' }}>
        {filtered.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, height: '100%', textAlign: 'center', padding: '0 24px' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ticket size={24} color="#d1d5db" strokeWidth={1.5} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#64748b' }}>No {filter === 'all' ? '' : filter} tickets</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>All chat sessions appear here.</div>
          </div>
        )}
        {filtered.map(t => {
          const st = STATUS_STYLE[t.status] || STATUS_STYLE.open
          return (
            <div key={t.id} style={{ border: `1.5px solid ${st.border}`, borderRadius: 14, padding: '11px 12px', marginBottom: 8, background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Avatar name={t.created_by_name} size={30} role={t.created_by_role} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.created_by_name}</div>
                  <div style={{ fontSize: 11, color: '#64748b', textTransform: 'capitalize' }}>{t.created_by_role}</div>
                </div>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 99, background: st.bg, color: st.color, border: `1px solid ${st.border}`, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                  <st.Icon size={10} strokeWidth={2.5} /> {st.label}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#475569', marginBottom: 5, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{t.subject || 'General inquiry'}"</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: '#94a3b8' }}>
                <Clock size={11} /> {fmtDate(t.created_at)}
                {t.msg_count > 0 && <><span>·</span><MessageSquare size={11} />{t.msg_count}</>}
                {t.admin_name && t.status === 'active' && <><span>·</span><span style={{ color: '#059669', fontWeight: 600 }}>w/ {t.admin_name}</span></>}
              </div>
              {(t.status === 'closed' || t.status === 'reviewed') && t.closed_by_name && (
                <div style={{ marginTop: 5, fontSize: 11, color: t.resolution === 'reviewed' ? '#7c3aed' : '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {t.resolution === 'reviewed' ? <BookOpen size={11} /> : <XCircle size={11} />}
                  {t.resolution === 'reviewed' ? `Sent to review by ${t.closed_by_name}` : `Closed by ${t.closed_by_name}`}
                </div>
              )}
              {t.status === 'escalated' && (
                <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
                  <button onClick={() => onAccept(t)} style={{ flex: 1, padding: '7px 0', borderRadius: 10, background: 'linear-gradient(135deg,#1d6ef5,#0ea5e9)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    <Check size={13} /> Join Chat
                  </button>
                  <button onClick={() => onDecline(t)} style={{ flex: 1, padding: '7px 0', borderRadius: 10, background: '#fff', border: '1.5px solid #fca5a5', color: '#ef4444', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    <XCircle size={13} /> Decline
                  </button>
                </div>
              )}
              {(t.status === 'closed' || t.status === 'open') && (
                <button onClick={() => onOpen(t)} style={{ marginTop: 7, width: '100%', padding: '6px 0', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                  View transcript
                </button>
              )}
              {(t.status === 'open' || t.status === 'active') && (
                <button onClick={() => { if (window.confirm(`Close this ticket from ${t.created_by_name}?`)) onCloseTicket(t) }} style={{ marginTop: 7, width: '100%', padding: '6px 0', borderRadius: 10, background: '#fff', border: '1.5px solid #fecaca', color: '#ef4444', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <Lock size={12} /> Close ticket
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
})

/* ─── Ticket transcript viewer ───────────────────────────────────── */
const TicketViewer = memo(function TicketViewer({ ticket, messages, myEmail, onClose }) {
  const st = STATUS_STYLE[ticket.status] || STATUS_STYLE.open
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid #f1f5f9', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#64748b', display: 'flex', alignItems: 'center' }}>
          <ArrowRight size={15} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.created_by_name}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmtDate(ticket.created_at)}</div>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 99, background: st.bg, color: st.color, border: `1px solid ${st.border}`, fontSize: 10, fontWeight: 700 }}>
          <st.Icon size={10} strokeWidth={2.5} /> {st.label}
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 8px' }}>
        {messages.map((m, i) => <Bubble key={m.id || i} msg={m} myEmail={myEmail} />)}
        {ticket.closed_by_name && (
          <div style={{ textAlign: 'center', margin: '12px 0 4px' }}>
            <span style={{ fontSize: 11, padding: '4px 12px', borderRadius: 99, background: '#f8fafc', color: '#94a3b8', fontStyle: 'italic', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {ticket.resolution === 'reviewed' ? <BookOpen size={11} /> : <Lock size={11} />}
              {ticket.resolution === 'reviewed' ? `Sent to review by ${ticket.closed_by_name}` : `Closed by ${ticket.closed_by_name}`}
            </span>
          </div>
        )}
      </div>
    </div>
  )
})

/* ─── Message areas ──────────────────────────────────────────────── */
const UserMessageArea = memo(function UserMessageArea({ messages, myEmail, msgEndRef }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 6px', minHeight: 0 }}>
      {messages.map((m, i) => <Bubble key={m.id || i} msg={m} myEmail={myEmail} />)}
      <div ref={msgEndRef} />
    </div>
  )
})

const AdminMessageArea = memo(function AdminMessageArea({ messages, myEmail, adminEndRef }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 6px', minHeight: 0 }}>
      {messages.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '28px 0', color: '#94a3b8' }}>
          <HandMetal size={22} color="#d1d5db" strokeWidth={1.5} />
          <span style={{ fontSize: 13 }}>You joined — say hello</span>
        </div>
      )}
      {messages.map((m, i) => <Bubble key={m.id || i} msg={m} myEmail={myEmail} />)}
      <div ref={adminEndRef} />
    </div>
  )
})

/* ══════════════════════════════════════════════════════════════════ */
export default function FloatingChat() {
  const { key, role, label, email, avatar } = useKey()

  const [open,  setOpen]  = useState(false)
  const [tab,   setTab]   = useState('home')

  // profanity strike system — initialise from localStorage so timeout survives new chats/refreshes
  const [strikes,      setStrikes]      = useState(0)
  const [strikeShow,   setStrikeShow]   = useState(false)
  const [timedOut,     setTimedOut]     = useState(() => getStoredTimeoutSecsLeft() > 0)
  const [timeoutSecs,  setTimeoutSecs]  = useState(() => getStoredTimeoutSecsLeft())
  const strikeTimer  = useRef(null)
  const timeoutTimer = useRef(null)

  // user chat state
  const [session,  setSession]  = useState(null)
  const [messages, setMessages] = useState([])
  const [input,    setInput]    = useState('')
  const [sending,  setSending]  = useState(false)
  const [starting, setStarting] = useState(false)

  // chat history (non-superadmin)
  const [history,        setHistory]        = useState([])
  const [historyLoaded,  setHistoryLoaded]  = useState(false)
  const [viewHistory,    setViewHistory]    = useState(null)
  const [viewHistoryMsgs,setViewHistoryMsgs] = useState([])

  // admin chat state
  const [activeSession,    setActiveSession]    = useState(null)
  const [activeSessionStatus, setActiveSessionStatus] = useState('active')
  const [adminMessages,    setAdminMessages]    = useState([])
  const [adminInput,       setAdminInput]       = useState('')
  const [adminSending,     setAdminSending]     = useState(false)
  const [escalated,        setEscalated]        = useState([])
  const [escalatedCount,   setEscalatedCount]   = useState(0)

  // tickets tab
  const [tickets,      setTickets]      = useState([])
  const [ticketFilter, setTicketFilter] = useState('all')
  const [viewTicket,   setViewTicket]   = useState(null)
  const [viewMessages, setViewMessages] = useState([])

  const msgEndRef     = useRef(null)
  const adminEndRef   = useRef(null)
  const inputRef      = useRef(null)
  const adminInputRef = useRef(null)
  const polls         = useRef({})
  const prevMsgLen    = useRef(0)
  const prevAdminLen  = useRef(0)

  const api = useCallback((path, opts = {}) =>
    fetch(path, { ...opts, headers: { 'x-api-key': key, 'Content-Type': 'application/json', ...(opts.headers || {}) } })
      .then(r => r.json()), [key])

  /* poll — user messages + session status */
  useEffect(() => {
    clearInterval(polls.current.msg)
    if (!key || !session || session.status === 'closed') return
    const run = () => {
      api(`/api/chat/sessions/${session.id}/messages`).then(d => Array.isArray(d) && setMessages(d)).catch(() => {})
      api('/api/chat/sessions').then(d => {
        if (Array.isArray(d)) { const s = d.find(x => x.id === session.id); if (s) setSession(s) }
      }).catch(() => {})
    }
    run(); polls.current.msg = setInterval(run, 3000)
    return () => clearInterval(polls.current.msg)
  }, [key, session?.id, session?.status]) // eslint-disable-line

  /* poll — escalated requests (superadmin) */
  useEffect(() => {
    clearInterval(polls.current.pending)
    if (!key || role !== 'superadmin') return
    const run = () => api('/api/chat/sessions/pending').then(d => {
      if (d?.count != null) { setEscalatedCount(d.count); setEscalated(d.sessions || []) }
    }).catch(() => {})
    run(); polls.current.pending = setInterval(run, 4000)
    return () => clearInterval(polls.current.pending)
  }, [key, role]) // eslint-disable-line

  /* poll — admin active chat + detect if user closed it */
  useEffect(() => {
    clearInterval(polls.current.admin)
    if (!activeSession) return
    const run = async () => {
      // fetch messages
      const msgs = await api(`/api/chat/sessions/${activeSession.id}/messages`).catch(() => null)
      if (Array.isArray(msgs)) setAdminMessages(msgs)
      // also check session status so we know if user ended the chat
      const sessions = await api('/api/chat/sessions').catch(() => null)
      if (Array.isArray(sessions)) {
        const s = sessions.find(x => x.id === activeSession.id)
        if (s) setActiveSessionStatus(s.status)
      }
    }
    run(); polls.current.admin = setInterval(run, 3000)
    return () => clearInterval(polls.current.admin)
  }, [activeSession?.id]) // eslint-disable-line

  /* poll — tickets (superadmin) */
  useEffect(() => {
    clearInterval(polls.current.tickets)
    if (!key || role !== 'superadmin') return
    const run = () => api('/api/chat/tickets').then(d => Array.isArray(d) && setTickets(d)).catch(() => {})
    run(); polls.current.tickets = setInterval(run, 5000)
    return () => clearInterval(polls.current.tickets)
  }, [key, role]) // eslint-disable-line

  /* load chat history for regular users */
  useEffect(() => {
    if (!open || !key || role === 'superadmin' || historyLoaded) return
    api('/api/chat/sessions').then(d => {
      if (Array.isArray(d)) {
        setHistory(d.filter(s => s.status === 'closed'))
        setHistoryLoaded(true)
      }
    }).catch(() => {})
  }, [open, key, role, historyLoaded]) // eslint-disable-line

  /* scroll on new messages */
  useEffect(() => {
    if (messages.length !== prevMsgLen.current) {
      prevMsgLen.current = messages.length
      msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  useEffect(() => {
    if (adminMessages.length !== prevAdminLen.current) {
      prevAdminLen.current = adminMessages.length
      adminEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [adminMessages.length])

  /* auto-focus input when switching to messages tab */
  useEffect(() => {
    if (tab === 'messages') setTimeout(() => (role === 'superadmin' ? adminInputRef : inputRef).current?.focus(), 80)
  }, [tab, session?.id, activeSession?.id]) // eslint-disable-line

  /* refocus admin input when activeSession changes */
  useEffect(() => {
    if (role === 'superadmin' && activeSession) {
      setTimeout(() => adminInputRef.current?.focus(), 100)
    }
  }, [activeSession?.id]) // eslint-disable-line

  if (!key) return null

  /* ── resume timeout countdown if one was active when component mounts ── */
  useEffect(() => {
    const secsLeft = getStoredTimeoutSecsLeft()
    if (secsLeft <= 0) return
    setTimedOut(true)
    setTimeoutSecs(secsLeft)
    let s = secsLeft
    clearInterval(timeoutTimer.current)
    timeoutTimer.current = setInterval(() => {
      s -= 1
      setTimeoutSecs(s)
      if (s <= 0) {
        clearInterval(timeoutTimer.current)
        clearStoredTimeout()
        setTimedOut(false)
        setStrikes(0)
        setStrikeShow(false)
      }
    }, 1000)
    return () => clearInterval(timeoutTimer.current)
  }, []) // eslint-disable-line

  /* ── strike system ── */
  function triggerStrike(newCount) {
    setStrikeShow(true)
    clearTimeout(strikeTimer.current)
    strikeTimer.current = setTimeout(() => setStrikeShow(false), 4000)
    if (newCount >= 3) {
      setStoredTimeout()           // persist to localStorage
      setTimedOut(true)
      let secs = TIMEOUT_MS / 1000
      setTimeoutSecs(secs)
      clearInterval(timeoutTimer.current)
      timeoutTimer.current = setInterval(() => {
        secs -= 1
        setTimeoutSecs(secs)
        if (secs <= 0) {
          clearInterval(timeoutTimer.current)
          clearStoredTimeout()
          setTimedOut(false)
          setStrikes(0)
          setStrikeShow(false)
        }
      }, 1000)
    }
  }

  /* ── actions ── */
  async function startChat() {
    if (starting || timedOut) return
    setStarting(true); setTab('messages')
    try {
      const d = await api('/api/chat/sessions', { method: 'POST', body: JSON.stringify({ subject: 'General inquiry' }) })
      if (d.id) setSession({ ...d, status: 'open' })
    } catch {}
    setStarting(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function sendMsg() {
    const text = input.trim()
    if (!text || sending || !session) return
    if (timedOut) return
    if (hasProfanity(text)) {
      setInput('')
      const next = strikes + 1
      setStrikes(next)
      triggerStrike(next)
      return
    }
    if (text.toLowerCase() === '!admincall') {
      setInput('')
      // already called or admin already joined — don't send again
      if (session.status === 'escalated' || session.status === 'active') {
        setTimeout(() => inputRef.current?.focus(), 30); return
      }
      setSending(true)
      try {
        await api(`/api/chat/sessions/${session.id}/admincall`, { method: 'POST' })
        setSession(p => ({ ...p, status: 'escalated' }))
      } catch {}
      setSending(false); setTimeout(() => inputRef.current?.focus(), 30); return
    }
    setSending(true); setInput('')
    try {
      const m = await api(`/api/chat/sessions/${session.id}/messages`, { method: 'POST', body: JSON.stringify({ message: text }) })
      if (m.id) setMessages(p => [...p, m])
    } catch {}
    setSending(false); setTimeout(() => inputRef.current?.focus(), 30)
  }

  async function endUserChat() {
    if (!session) return
    await api(`/api/chat/sessions/${session.id}/close`, { method: 'POST', body: JSON.stringify({ resolution: 'closed' }) })
    setSession(p => ({ ...p, status: 'closed' }))
  }

  async function acceptTicket(s) {
    await api(`/api/chat/sessions/${s.id}/accept`, { method: 'POST' })
    setActiveSession(s); setActiveSessionStatus('active'); setAdminMessages([])
    setEscalated(p => p.filter(x => x.id !== s.id)); setEscalatedCount(p => Math.max(0, p - 1))
    setTab('messages')
  }

  async function declineTicket(s) {
    await api(`/api/chat/sessions/${s.id}/decline`, { method: 'POST' })
    setEscalated(p => p.filter(x => x.id !== s.id)); setEscalatedCount(p => Math.max(0, p - 1))
  }

  async function sendAdminMsg() {
    if (!adminInput.trim() || adminSending || !activeSession) return
    setAdminSending(true); const text = adminInput.trim(); setAdminInput('')
    try {
      const m = await api(`/api/chat/sessions/${activeSession.id}/messages`, { method: 'POST', body: JSON.stringify({ message: text }) })
      if (m.id) setAdminMessages(p => [...p, m])
    } catch {}
    setAdminSending(false); setTimeout(() => adminInputRef.current?.focus(), 30)
  }

  async function endAdminChat() {
    if (!activeSession) return
    await api(`/api/chat/sessions/${activeSession.id}/close`, { method: 'POST', body: JSON.stringify({ resolution: 'closed' }) })
    setActiveSession(null); setAdminMessages([]); setTab('home')
  }

  async function sendToReview() {
    if (!activeSession) return
    await api(`/api/chat/sessions/${activeSession.id}/close`, { method: 'POST', body: JSON.stringify({ resolution: 'reviewed' }) })
    setActiveSession(null); setAdminMessages([]); setTab('tickets')
  }

  function dismissClosedAdminChat() {
    setActiveSession(null); setAdminMessages([]); setActiveSessionStatus('active'); setTab('tickets')
  }

  async function closeTicket(t) {
    await api(`/api/chat/sessions/${t.id}/close`, { method: 'POST', body: JSON.stringify({ resolution: 'closed' }) })
    setTickets(p => p.map(x => x.id === t.id ? { ...x, status: 'closed', resolution: 'closed', closed_by_name: label } : x))
    setEscalated(p => p.filter(x => x.id !== t.id)); setEscalatedCount(p => Math.max(0, p - (t.status === 'escalated' ? 1 : 0)))
    if (activeSession?.id === t.id) { setActiveSession(null); setAdminMessages([]) }
  }

  async function openHistory(s) {
    const msgs = await api(`/api/chat/sessions/${s.id}/messages`).catch(() => [])
    setViewHistoryMsgs(Array.isArray(msgs) ? msgs : [])
    setViewHistory(s)
    setTab('messages')
  }

  async function openTicketTranscript(t) {
    const msgs = await api(`/api/chat/sessions/${t.id}/messages`).catch(() => [])
    setViewMessages(Array.isArray(msgs) ? msgs : [])
    setViewTicket(t)
  }

  /* ── derived ── */
  const isSuperAdmin     = role === 'superadmin'
  const inUserChat       = tab === 'messages' && !isSuperAdmin && session && session.status !== 'closed'
  const inAdminChat      = tab === 'messages' && isSuperAdmin && activeSession
  const adminChatClosed  = inAdminChat && activeSessionStatus === 'closed'
  const hasActiveSession = session && session.status !== 'closed'

  const banner = !isSuperAdmin && session?.status === 'escalated'
    ? { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', Icon: ShieldAlert, text: 'Admin call sent — joining shortly…' }
    : !isSuperAdmin && session?.status === 'active'
    ? { bg: '#f0fdf4', color: '#059669', border: '#bbf7d0', Icon: CheckCircle,  text: `${session.admin_name || 'Admin'} joined the chat` }
    : null

  return (
    <>
      <style>{`
        @keyframes fc-pulse   { 0%{transform:scale(1);opacity:1} 100%{transform:scale(1.8);opacity:0} }
        @keyframes fc-spin    { to{transform:rotate(360deg)} }
        @keyframes fc-slidein { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        .fc-win { animation: fc-slidein .2s ease both; }
      `}</style>

      {/* launcher button */}
      <button onClick={() => setOpen(o => !o)} style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 9999, width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg,#1a65e8,#0ea5e9)', border: 'none', cursor: 'pointer', boxShadow: '0 6px 24px rgba(26,101,232,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        {open ? <X size={22} color="#fff" /> : <MessageCircle size={25} color="#fff" />}
        {!open && escalatedCount === 0 && <span style={{ position: 'absolute', inset: -5, borderRadius: '50%', border: '2px solid rgba(26,101,232,.35)', animation: 'fc-pulse 2.2s ease-out infinite' }} />}
        {!open && escalatedCount > 0 && <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 19, height: 19, borderRadius: 10, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', padding: '0 3px' }}>{escalatedCount}</span>}
      </button>

      {/* chat window */}
      {open && (
        <div className="fc-win" style={{ position: 'fixed', bottom: 96, right: 28, zIndex: 9998, width: 370, height: 540, borderRadius: 20, background: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden', isolation: 'isolate' }}>

          {(inUserChat || inAdminChat)
            ? <ChatHeader
                name={isSuperAdmin ? activeSession?.created_by_name : (session?.admin_name || 'Vianova Support')}
                subRole={isSuperAdmin ? activeSession?.created_by_role : 'superadmin'}
                isAdmin={isSuperAdmin}
                onEnd={isSuperAdmin ? endAdminChat : endUserChat}
                onReview={sendToReview}
                onClose={() => setOpen(false)}
              />
            : <HomeHeader label={label} role={role} avatar={avatar} escalatedCount={escalatedCount} onClose={() => setOpen(false)} />
          }

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

            {/* ── HOME ── */}
            {tab === 'home' && (
              <HomeTab
                role={role} escalatedCount={escalatedCount} starting={starting}
                hasActiveSession={hasActiveSession}
                onNewChat={startChat}
                onGoMessages={() => setTab('messages')}
                onGoTickets={() => setTab('tickets')}
                history={history}
                onViewHistory={openHistory}
              />
            )}

            {/* ── USER MESSAGES ── */}
            {tab === 'messages' && !isSuperAdmin && (
              <>
                {viewHistory && (
                  <TicketViewer
                    ticket={{ ...viewHistory, created_by_name: 'You', created_by_role: role, closed_by_name: null }}
                    messages={viewHistoryMsgs}
                    myEmail={email}
                    onClose={() => setViewHistory(null)}
                  />
                )}
                {!viewHistory && starting && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, border: '3px solid #e2e8f0', borderTop: '3px solid #1d6ef5', borderRadius: '50%', animation: 'fc-spin 1s linear infinite' }} />
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>Opening chat…</div>
                  </div>
                )}
                {!viewHistory && !starting && !session && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '0 24px', textAlign: 'center' }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MessageSquare size={26} color="#1d6ef5" strokeWidth={1.5} />
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>No active conversation</div>
                    <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>Press <strong>New Message</strong> on the Home tab to start.</div>
                    <button onClick={startChat} style={{ padding: '10px 22px', borderRadius: 12, background: 'linear-gradient(135deg,#1d6ef5,#0ea5e9)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>Start Chat</button>
                  </div>
                )}
                {!viewHistory && !starting && session && session.status === 'closed' && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '0 24px', textAlign: 'center' }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CheckCircle size={28} color="#059669" strokeWidth={1.5} />
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Chat ended</div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>Thank you for reaching out!</div>
                    <button onClick={() => { setSession(null); setMessages([]) }} style={{ marginTop: 8, padding: '10px 22px', borderRadius: 12, background: 'linear-gradient(135deg,#1d6ef5,#0ea5e9)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>New Chat</button>
                  </div>
                )}
                {!viewHistory && !starting && session && session.status !== 'closed' && (
                  <>
                    {banner && (
                      <div style={{ flexShrink: 0, background: banner.bg, borderBottom: `1px solid ${banner.border}`, padding: '7px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: banner.color }}>
                        <banner.Icon size={13} strokeWidth={2.5} /> {banner.text}
                      </div>
                    )}
                    <UserMessageArea messages={messages} myEmail={email} msgEndRef={msgEndRef} />
                    <InputBar value={input} onChange={e => setInput(e.target.value)} onSend={sendMsg} disabled={sending} fwdRef={inputRef} />
                  </>
                )}
              </>
            )}

            {/* ── ADMIN MESSAGES ── */}
            {tab === 'messages' && isSuperAdmin && (
              <>
                {!activeSession && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 24px', textAlign: 'center' }}>
                    <div style={{ width: 50, height: 50, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MessageSquare size={22} color="#d1d5db" />
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#64748b' }}>No active chat</div>
                    <div style={{ fontSize: 12.5, color: '#94a3b8', lineHeight: 1.6 }}>Accept an <strong>!admincall</strong> from the Tickets tab.</div>
                    {escalatedCount > 0 && <button onClick={() => setTab('tickets')} style={{ padding: '9px 18px', borderRadius: 12, background: '#ef4444', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><ShieldAlert size={14} /> {escalatedCount} Request{escalatedCount > 1 ? 's' : ''}</button>}
                  </div>
                )}

                {/* user closed the chat while admin was in it */}
                {activeSession && adminChatClosed && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 28px', textAlign: 'center' }}>
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#f8fafc', border: '2px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <PhoneOff size={22} color="#94a3b8" />
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Session closed</div>
                    <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
                      <strong>{activeSession.created_by_name}</strong> has ended the chat and no longer needs assistance.
                    </div>
                    <button onClick={dismissClosedAdminChat} style={{ padding: '10px 22px', borderRadius: 12, background: 'linear-gradient(135deg,#1d6ef5,#0ea5e9)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
                      Back to Tickets
                    </button>
                  </div>
                )}

                {/* active admin chat */}
                {activeSession && !adminChatClosed && (
                  <>
                    <AdminMessageArea messages={adminMessages} myEmail={email} adminEndRef={adminEndRef} />
                    <InputBar value={adminInput} onChange={e => setAdminInput(e.target.value)} onSend={sendAdminMsg} disabled={adminSending} fwdRef={adminInputRef} placeholder={`Reply to ${activeSession.created_by_name}…`} />
                  </>
                )}
              </>
            )}

            {/* ── TICKETS (superadmin) ── */}
            {tab === 'tickets' && isSuperAdmin && (
              viewTicket
                ? <TicketViewer ticket={viewTicket} messages={viewMessages} myEmail={email} onClose={() => setViewTicket(null)} />
                : <TicketsTab tickets={tickets} onAccept={acceptTicket} onDecline={declineTicket} onOpen={openTicketTranscript} onCloseTicket={closeTicket} filter={ticketFilter} setFilter={setTicketFilter} />
            )}
          </div>

          <TabBar tab={tab} setTab={t => { setTab(t); setViewTicket(null) }} isSuperAdmin={isSuperAdmin} escalatedCount={escalatedCount} />

          {/* ── Strike warning overlay (shows on top of any tab) ── */}
          {strikeShow && !timedOut && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(254,226,226,.92)', backdropFilter: 'blur(2px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, zIndex: 10, borderRadius: 20, animation: 'fc-slidein .18s ease both' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(185,28,28,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={30} color="#b91c1c" strokeWidth={2} />
              </div>
              <div style={{ fontWeight: 900, fontSize: 22, color: '#b91c1c', letterSpacing: -.5 }}>Strike {strikes}</div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#dc2626' }}>
                {3 - strikes} more {3 - strikes === 1 ? 'strike' : 'strikes'} before timeout
              </div>
              <div style={{ fontSize: 12, color: '#ef4444', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Check size={11} /> Keep it respectful
              </div>
            </div>
          )}

          {/* ── Timeout overlay ── */}
          {timedOut && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(127,29,29,.93)', backdropFilter: 'blur(3px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, zIndex: 10, borderRadius: 20 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ban size={34} color="#fff" strokeWidth={1.8} />
              </div>
              <div style={{ fontWeight: 900, fontSize: 20, color: '#fff', letterSpacing: -.5 }}>Timeout</div>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#fca5a5', textAlign: 'center', maxWidth: 220, lineHeight: 1.6 }}>
                You've been timed out for inappropriate language.
              </div>
              <div style={{ marginTop: 6, background: 'rgba(255,255,255,.12)', borderRadius: 12, padding: '8px 20px', fontWeight: 800, fontSize: 18, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                {Math.floor(timeoutSecs / 60)}:{String(timeoutSecs % 60).padStart(2, '0')}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
