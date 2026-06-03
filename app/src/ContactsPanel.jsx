import { useState } from 'react'
import { CHANNELS, OUTREACH_META, altEmail, outreachStatus } from './util.js'

export default function ContactsPanel({ deal, state, altCtx, senderName, onContact, onRemoveContact, onPatch }) {
  const cs = state.contacts || {}
  const os = outreachStatus(deal, state)
  const om = OUTREACH_META[os]

  const functionChallenge = state.functionChallenge ?? (altCtx?.function_or_challenge || 'Transactional HR work')
  const mainFullName = altCtx?.main_contact_full_name || mainNameFromDeal(deal)
  const mainFirst = altCtx?.main_contact_first_name || (mainFullName ? mainFullName.split(' ')[0] : '')

  const mainContacts = (deal.contacts || []).map(c => ({
    key: 'c' + c.contact_id,
    firstname: c.firstname, lastname: c.lastname,
    title: c.jobtitle, email: c.email, isAlternate: false,
  }))
  const altContacts = Object.entries(cs)
    .filter(([, v]) => v?.isAlternate)
    .map(([key, v]) => ({ key, ...v }))

  return (
    <div className="cp">
      <div className="cp-head">
        <span className="cp-title">Contacts &amp; outreach</span>
        <span className="cp-status" style={{ background: om.bg, color: om.color }}>{om.label}</span>
      </div>

      <label className="cp-fc">
        <span>Reaching out about — AI for…</span>
        <input
          value={functionChallenge}
          onChange={e => onPatch({ functionChallenge: e.target.value })}
          placeholder="Transactional HR work" />
      </label>

      <div className="cp-section-label">On-file contacts ({mainContacts.length})</div>
      {mainContacts.length === 0 && <div className="cp-empty">No contacts on file for this account.</div>}
      {mainContacts.map(c => (
        <ContactRow key={c.key} c={c} st={cs[c.key]} onContact={onContact} />
      ))}

      <div className="cp-section-label">
        Alternate contacts ({altContacts.length})
        <span className="cp-hint">people you found to prospect (e.g. via LinkedIn)</span>
      </div>
      {altContacts.map(c => (
        <ContactRow key={c.key} c={c} st={cs[c.key]} onContact={onContact} onRemove={() => onRemoveContact(c.key)}
          alt={{ mainFullName, mainFirst, functionChallenge, senderName }} />
      ))}

      <AddAltForm onAdd={data => onContact('alt-' + crypto.randomUUID().slice(0, 8),
        { isAlternate: true, contacted: false, ...data })} />
    </div>
  )
}

function ContactRow({ c, st = {}, onContact, onRemove, alt }) {
  const [open, setOpen] = useState(false)
  const name = `${c.firstname || ''} ${c.lastname || ''}`.trim() || '(no name)'
  const contacted = !!st.contacted
  return (
    <div className={'cr' + (contacted ? ' done' : '')}>
      <button className={'cr-check' + (contacted ? ' on' : '')}
        title={contacted ? 'Mark not contacted' : 'Mark contacted'}
        onClick={() => onContact(c.key, { contacted: !contacted })}>
        {contacted ? '✓' : ''}
      </button>
      <div className="cr-main">
        <div className="cr-top">
          <span className="cr-name">{name}</span>
          {c.isAlternate && <span className="cr-alt-tag">alt</span>}
          {c.title && <span className="cr-title">· {c.title}</span>}
        </div>
        {c.email && <a className="cr-email" href={`mailto:${c.email}`}>{c.email}</a>}
        {c.linkedin && <a className="cr-email" href={c.linkedin} target="_blank" rel="noreferrer">LinkedIn ↗</a>}
      </div>
      <div className="cr-side">
        {contacted && (
          <select className="cr-channel" value={st.channel || 'Email'}
            onChange={e => onContact(c.key, { channel: e.target.value })}>
            {CHANNELS.map(ch => <option key={ch}>{ch}</option>)}
          </select>
        )}
        <button className="cr-expand" onClick={() => setOpen(o => !o)}>{open ? 'Hide notes' : 'Notes'}</button>
        {onRemove && <button className="cr-del" title="Remove" onClick={onRemove}>✕</button>}
      </div>

      {open && (
        <div className="cr-detail">
          <textarea className="cr-notes" placeholder="What did you say / what was the response?"
            value={st.notes || ''} onChange={e => onContact(c.key, { notes: e.target.value })} />
        </div>
      )}

      {/* The alternate intro email is always visible for alternate contacts. */}
      {c.isAlternate && alt && (
        <div className="cr-detail">
          <AltEmail recipientFirst={c.firstname} seed={c.key} {...alt} />
        </div>
      )}
    </div>
  )
}

function AltEmail({ recipientFirst, mainFullName, functionChallenge, senderName, seed }) {
  const [copied, setCopied] = useState(false)
  const { subject, body } = altEmail({ recipientFirst, mainFullName, functionChallenge, senderName, seed })
  const copy = () => {
    navigator.clipboard?.writeText(body)
    setCopied(true); setTimeout(() => setCopied(false), 1600)
  }
  return (
    <div className="alt-email">
      <div className="alt-top">
        <span className="alt-label">✎ Alternate intro email</span>
        <button className="btn-copy" onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</button>
      </div>
      <div className="alt-subject">Subject: {subject}</div>
      <div className="alt-body">{body}</div>
    </div>
  )
}

function AddAltForm({ onAdd }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ firstname: '', lastname: '', title: '', email: '', linkedin: '' })
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const submit = () => {
    if (!f.firstname.trim()) return
    onAdd({ ...f })
    setF({ firstname: '', lastname: '', title: '', email: '', linkedin: '' })
    setOpen(false)
  }
  if (!open) return <button className="add-alt" onClick={() => setOpen(true)}>+ Add alternate contact</button>
  return (
    <div className="alt-form">
      <div className="alt-form-grid">
        <input placeholder="First name *" value={f.firstname} onChange={set('firstname')} autoFocus />
        <input placeholder="Last name" value={f.lastname} onChange={set('lastname')} />
        <input placeholder="Title" value={f.title} onChange={set('title')} />
        <input placeholder="Email" value={f.email} onChange={set('email')} />
        <input placeholder="LinkedIn URL" value={f.linkedin} onChange={set('linkedin')} className="alt-form-wide" />
      </div>
      <div className="alt-form-actions">
        <button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn add" disabled={!f.firstname.trim()} onClick={submit}>Add contact</button>
      </div>
    </div>
  )
}

function mainNameFromDeal(deal) {
  const c = (deal.contacts || [])[0]
  return c ? `${c.firstname || ''} ${c.lastname || ''}`.trim() : ''
}
