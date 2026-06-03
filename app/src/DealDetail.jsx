import { useState, useMemo } from 'react'
import {
  catMeta, money, scoreColor, fmtDate, relDays, emailLead, meetingBrief, gongUrl,
  STAGES, DQ_REASONS, stageMeta, directEmail,
} from './util.js'
import ContactsPanel from './ContactsPanel.jsx'

export default function DealDetail({ deal, state, draft, altCtx, senderName, onPatch, onContact, onRemoveContact }) {
  const m = catMeta(deal.reason_category)
  const days = relDays(deal.last_activity_date)
  const f = deal.score_factors
  const [dqOpen, setDqOpen] = useState(false)
  const [person, setPerson] = useState('all')
  const [copied, setCopied] = useState(false)

  // Softer direct-contact email, generated live from context + any alternate contacts
  // (alternates are mentioned as "…was there as well").
  const altNames = Object.values(state.contacts || {})
    .filter(c => c.isAlternate && c.firstname).map(c => c.firstname)
  const functionChallenge = state.functionChallenge ?? (altCtx?.function_or_challenge || 'Transactional HR work')
  const directDraft = draft ? directEmail({
    contactFirst: draft.contact_first_name || altCtx?.main_contact_first_name,
    aeFirst: draft.ae_first_name,
    conversationMonth: draft.conversation_month,
    functionChallenge,
    secondaryNames: altNames,
    senderName,
  }) : null

  const copyDraft = () => {
    if (!directDraft) return
    navigator.clipboard?.writeText(directDraft.body)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  // distinct people present in this deal's feed (+ a Team/unattributed bucket)
  const people = useMemo(() => {
    const names = new Set()
    let hasTeam = false
    for (const ev of deal.feed) {
      if (ev.person?.name) names.add(ev.person.name)
      else hasTeam = true
    }
    const list = [...names].sort()
    if (hasTeam) list.push('__team__')
    return list
  }, [deal])

  const feed = useMemo(() => deal.feed.filter(ev =>
    person === 'all' ||
    (person === '__team__' ? !ev.person?.name : ev.person?.name === person)
  ), [deal, person])

  const sm = stageMeta(state.stage)

  return (
    <div className="dd">
      {/* ---- header action bar ---- */}
      <div className="actionbar">
        <div className="ab-stage">
          <span className="ab-lbl">Stage</span>
          <select
            className="stage-select"
            value={state.stage}
            disabled={!!state.dq}
            style={{ background: sm.bg, color: sm.color, borderColor: sm.color }}
            onChange={e => onPatch({ stage: e.target.value })}>
            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {state.dq
          ? <button className="btn undo" onClick={() => onPatch({ dq: null })}>↺ Undo disqualify</button>
          : <button className="btn dq" onClick={() => setDqOpen(true)}>✕ Disqualify</button>}
      </div>

      {state.dq && (
        <div className="dq-banner">
          <strong>Disqualified</strong> — {state.dq.reason}
          {state.dq.note && <span className="dq-note"> · {state.dq.note}</span>}
        </div>
      )}

      {dqOpen && <DQForm onCancel={() => setDqOpen(false)}
        onConfirm={dq => { onPatch({ dq }); setDqOpen(false) }} />}

      {/* ---- suggested re-engagement email (direct contact) ---- */}
      {directDraft && (
        <div className="draft-card">
          <div className="draft-top">
            <span className="draft-label">✎ Re-engagement email · direct contact</span>
            <button className="btn-copy" onClick={copyDraft}>{copied ? '✓ Copied' : 'Copy'}</button>
          </div>
          <div className="draft-subject">Subject: {directDraft.subject}</div>
          <div className="draft-body">{directDraft.body}</div>
          {(draft.contact_first_name?.toLowerCase() === 'there' || !draft.contact_first_name) && (
            <div className="draft-warn">⚠ No named contact on file — confirm the recipient before sending.</div>
          )}
        </div>
      )}

      {/* ---- deal header ---- */}
      <div className="dd-head">
        <div>
          <h2>{deal.company}</h2>
          <div className="dd-tags">
            <span className="tag" style={{ background: m.bg, color: m.color }}>{deal.closed_lost_reason}</span>
            {deal.industry && <span className="tag ghost">{deal.industry}</span>}
            {deal.employees && <span className="tag ghost">{deal.employees} EE</span>}
          </div>
        </div>
        <div className="dd-score">
          <div className="big-score" style={{ color: scoreColor(deal.reengage_score) }}>
            {Math.round(deal.reengage_score)}
          </div>
          <div className="big-score-lbl">re-engage score</div>
        </div>
      </div>

      <div className="dd-grid">
        <Field label="Amount" value={money(deal.amount)} />
        <Field label="Owner" value={deal.owner} />
        <Field label="Closed" value={fmtDate(deal.close_date)} />
        <Field label="Last activity"
          value={`${fmtDate(deal.last_activity_date)}${days != null ? ` (${days}d ago)` : ''}`} />
        <Field label="Created" value={fmtDate(deal.create_date)} />
        <Field label="Activity" value={`${deal.n_emails} emails · ${deal.n_meetings} meetings`} />
      </div>

      <div className="score-bd">
        <span>Score drivers:</span>
        <Bar label="Reason" v={f.reason_weight} />
        <Bar label="Recency" v={f.recency} />
        <Bar label="Sentiment" v={(f.sentiment + 1) / 2} />
        <Bar label="Deal size" v={f.amount_factor} />
        <a className="hs-link" href={deal.hubspot_url} target="_blank" rel="noreferrer">Open in HubSpot ↗</a>
      </div>

      <ContactsPanel
        deal={deal} state={state} altCtx={altCtx} senderName={senderName}
        onContact={onContact} onRemoveContact={onRemoveContact} onPatch={onPatch} />

      {deal.next_step_notes && (
        <details className="notes">
          <summary>Rep next-step log</summary>
          <pre>{deal.next_step_notes}</pre>
        </details>
      )}

      <div className="feed-head">
        <h3 className="feed-title">Activity feed <span>({feed.length})</span></h3>
        {people.length > 0 && (
          <select className="person-filter" value={person} onChange={e => setPerson(e.target.value)}>
            <option value="all">All people</option>
            {people.map(p => (
              <option key={p} value={p}>{p === '__team__' ? 'Wisq team / unattributed' : p}</option>
            ))}
          </select>
        )}
      </div>

      {feed.length === 0 && (
        <div className="placeholder small">
          {deal.feed.length === 0
            ? 'No emails or meetings could be linked to this deal by domain or attendee name.'
            : 'No activity for this person.'}
        </div>
      )}
      <ul className="feed">
        {feed.map((ev, i) => ev.type === 'email'
          ? <EmailItem key={i} ev={ev} />
          : <MeetingItem key={i} ev={ev} />)}
      </ul>
    </div>
  )
}

function DQForm({ onConfirm, onCancel }) {
  const [reason, setReason] = useState(DQ_REASONS[0])
  const [note, setNote] = useState('')
  const isOther = reason === 'Other'
  const finalReason = isOther ? (note.trim() || 'Other') : reason
  return (
    <div className="dq-form">
      <div className="dq-form-row">
        <label>Disqualify reason</label>
        <select value={reason} onChange={e => setReason(e.target.value)}>
          {DQ_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <input
        className="dq-input"
        placeholder={isOther ? 'Describe the reason…' : 'Optional note…'}
        value={note} onChange={e => setNote(e.target.value)} autoFocus />
      <div className="dq-actions">
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn dq"
          disabled={isOther && !note.trim()}
          onClick={() => onConfirm({ reason: finalReason, note: isOther ? '' : note.trim() })}>
          Confirm disqualify
        </button>
      </div>
    </div>
  )
}

function PersonTag({ ev }) {
  if (!ev.person?.name) return null
  return <span className="person-tag">{ev.person.name}</span>
}

function EmailItem({ ev }) {
  const incoming = ev.direction === 'INCOMING_EMAIL'
  return (
    <li className={'ev email' + (incoming ? ' incoming' : '')}>
      <div className="ev-rail">
        <span className="ev-icon" title={incoming ? 'Inbound' : 'Outbound'}>{incoming ? '↙' : '↗'}</span>
      </div>
      <div className="ev-body">
        <div className="ev-top">
          <span className="ev-kind">{incoming ? 'Email · inbound' : 'Email · outbound'}</span>
          <span className="ev-meta"><PersonTag ev={ev} /><span className="ev-date">{fmtDate(ev.dt, true)}</span></span>
        </div>
        <div className="ev-subject">{ev.subject || '(no subject)'}</div>
        <div className="ev-text">{emailLead(ev.body) || '—'}</div>
      </div>
    </li>
  )
}

function MeetingItem({ ev }) {
  const url = gongUrl(ev.body)
  return (
    <li className="ev meeting">
      <div className="ev-rail"><span className="ev-icon mtg">●</span></div>
      <div className="ev-body">
        <div className="ev-top">
          <span className="ev-kind mtg">Meeting / Gong call</span>
          <span className="ev-meta"><PersonTag ev={ev} /><span className="ev-date">{fmtDate(ev.dt, true)}</span></span>
        </div>
        <div className="ev-subject">{(ev.title || '').replace('[Gong] ', '')}</div>
        <div className="ev-text">{meetingBrief(ev.body)}</div>
        {url && <a className="gong-link" href={url} target="_blank" rel="noreferrer">▶ Gong recording</a>}
      </div>
    </li>
  )
}

function Field({ label, value }) {
  return <div className="field"><div className="field-lbl">{label}</div><div className="field-val">{value}</div></div>
}

function Bar({ label, v }) {
  return (
    <div className="sbar">
      <span className="sbar-lbl">{label}</span>
      <span className="sbar-track"><span className="sbar-fill" style={{ width: `${Math.round(v * 100)}%` }} /></span>
    </div>
  )
}
