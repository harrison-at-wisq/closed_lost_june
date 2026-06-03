import { useEffect, useMemo, useState, useCallback } from 'react'
import { catMeta, money, scoreColor, fmtDate, CATEGORY_META, DEFAULT_STAGE, stageMeta, OUTREACH_META, outreachStatus } from './util.js'
import DealDetail from './DealDetail.jsx'

const SORTS = {
  score:  { label: 'Re-engage score', fn: (a, b) => b.reengage_score - a.reengage_score },
  amount: { label: 'Deal size',       fn: (a, b) => b.amount - a.amount },
  recent: { label: 'Last activity',   fn: (a, b) => (b.last_activity_date || '').localeCompare(a.last_activity_date || '') },
  close:  { label: 'Close date',      fn: (a, b) => (b.close_date || '').localeCompare(a.close_date || '') },
}

// A deal's manual state: { stage, dq, contacts: { [key]: {...} }, functionChallenge }
const blank = () => ({ stage: DEFAULT_STAGE, dq: null, contacts: {} })

export default function App() {
  const [data, setData] = useState(null)
  const [drafts, setDrafts] = useState({})       // keyed by deal_id
  const [state, setState] = useState({})        // keyed by deal_id
  const [selId, setSelId] = useState(null)
  const [q, setQ] = useState('')
  const [cats, setCats] = useState(new Set())
  const [owner, setOwner] = useState('all')
  const [sort, setSort] = useState('score')
  const [showDQ, setShowDQ] = useState(false)
  const [outreach, setOutreach] = useState('all')
  const [navOpen, setNavOpen] = useState(true)
  const [altCtx, setAltCtx] = useState({})
  const [senderName, setSenderName] = useState(() => localStorage.getItem('senderName') || 'Harrison')

  useEffect(() => {
    fetch('/enriched_deals.json').then(r => r.json()).then(setData)
    fetch('/drafts.json').then(r => r.json()).then(setDrafts).catch(() => setDrafts({}))
    fetch('/alt_context.json').then(r => r.json()).then(setAltCtx).catch(() => setAltCtx({}))
    fetch('/api/state').then(r => r.json()).then(setState).catch(() => setState({}))
  }, [])

  useEffect(() => { localStorage.setItem('senderName', senderName) }, [senderName])

  // Merge persisted state onto a deal, falling back to defaults.
  const stateOf = useCallback(id => ({ ...blank(), ...state[id] }), [state])

  const persist = useCallback(next => {
    fetch('/api/state', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    }).catch(() => {})
    return next
  }, [])

  const patchDeal = useCallback((id, patch) =>
    setState(prev => persist({ ...prev, [id]: { ...blank(), ...prev[id], ...patch } })), [persist])

  // Merge a patch into one contact (main key = "c"+contact_id, alternate = "alt-"+id).
  const updateContact = useCallback((id, key, cpatch) =>
    setState(prev => {
      const d = { ...blank(), ...prev[id] }
      const contacts = { ...d.contacts, [key]: { ...d.contacts[key], ...cpatch } }
      return persist({ ...prev, [id]: { ...d, contacts } })
    }), [persist])

  const removeContact = useCallback((id, key) =>
    setState(prev => {
      const d = { ...blank(), ...prev[id] }
      const contacts = { ...d.contacts }; delete contacts[key]
      return persist({ ...prev, [id]: { ...d, contacts } })
    }), [persist])

  const owners = useMemo(
    () => data ? [...new Set(data.deals.map(d => d.owner).filter(Boolean))].sort() : [],
    [data])

  const dqCount = useMemo(
    () => data ? data.deals.filter(d => stateOf(d.deal_id).dq).length : 0,
    [data, state]) // eslint-disable-line

  const filtered = useMemo(() => {
    if (!data) return []
    const ql = q.trim().toLowerCase()
    return data.deals
      .filter(d => showDQ || !stateOf(d.deal_id).dq)
      .filter(d => outreach === 'all' || outreachStatus(d, stateOf(d.deal_id)) === outreach)
      .filter(d => cats.size === 0 || cats.has(d.reason_category))
      .filter(d => owner === 'all' || d.owner === owner)
      .filter(d => !ql ||
        (d.company || '').toLowerCase().includes(ql) ||
        (d.deal_name || '').toLowerCase().includes(ql) ||
        (d.industry || '').toLowerCase().includes(ql) ||
        (d.closed_lost_reason || '').toLowerCase().includes(ql))
      .sort(SORTS[sort].fn)
  }, [data, q, cats, owner, sort, showDQ, outreach, state]) // eslint-disable-line

  const selected = useMemo(
    () => data?.deals.find(d => d.deal_id === selId) || null,
    [data, selId])

  useEffect(() => {
    if (!filtered.length) return
    if (!filtered.some(d => d.deal_id === selId)) setSelId(filtered[0].deal_id)
  }, [filtered]) // eslint-disable-line

  if (!data) return <div className="loading">Loading dataset…</div>

  const catCounts = data.deals.reduce((m, d) => {
    m[d.reason_category] = (m[d.reason_category] || 0) + 1; return m
  }, {})
  const toggleCat = c => {
    const n = new Set(cats); n.has(c) ? n.delete(c) : n.add(c); setCats(n)
  }
  const totalAmt = filtered.reduce((s, d) => s + d.amount, 0)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <button className="nav-toggle" title={navOpen ? 'Collapse list' : 'Show list'}
            onClick={() => setNavOpen(o => !o)}>{navOpen ? '⟨⟨' : '☰'}</button>
          <span className="logo">◆</span>
          <div>
            <h1>Closed-Lost Re-Engage</h1>
            <p>{data.campaign}</p>
          </div>
        </div>
        <div className="topstats">
          <label className="sender-field">
            <span>Your name</span>
            <input value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="Harrison" />
          </label>
          <Stat label="Deals shown" value={`${filtered.length} / ${data.n_deals}`} />
          <Stat label="Disqualified" value={dqCount} />
          <Stat label="Pipeline (shown)" value={money(totalAmt)} />
        </div>
      </header>

      <div className="body">
        {navOpen && <aside className="sidebar">
          <input
            className="search"
            placeholder="Search company, industry, reason…"
            value={q} onChange={e => setQ(e.target.value)} />

          <div className="filter-group">
            <label>Loss reason</label>
            <div className="chips">
              {Object.keys(CATEGORY_META).filter(c => catCounts[c]).map(c => {
                const m = catMeta(c), on = cats.has(c)
                return (
                  <button key={c} onClick={() => toggleCat(c)}
                    className={'chip' + (on ? ' on' : '')}
                    style={on ? { background: m.bg, color: m.color, borderColor: m.color } : {}}>
                    {m.label} <span className="cnt">{catCounts[c]}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="filter-row">
            <div className="filter-group">
              <label>Owner</label>
              <select value={owner} onChange={e => setOwner(e.target.value)}>
                <option value="all">All owners</option>
                {owners.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <label>Sort by</label>
              <select value={sort} onChange={e => setSort(e.target.value)}>
                {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          <div className="filter-group">
            <label>Outreach status</label>
            <select value={outreach} onChange={e => setOutreach(e.target.value)}>
              <option value="all">All</option>
              <option value="none">Not reached</option>
              <option value="main">Main contacted</option>
              <option value="alternate">Alt contacted</option>
              <option value="both">Main + alt</option>
            </select>
          </div>

          <label className="dq-toggle">
            <input type="checkbox" checked={showDQ} onChange={e => setShowDQ(e.target.checked)} />
            Show disqualified ({dqCount})
          </label>

          <ul className="deal-list">
            {filtered.map(d => {
              const st = stateOf(d.deal_id)
              const sm = stageMeta(st.stage)
              const os = outreachStatus(d, st)
              const om = OUTREACH_META[os]
              return (
                <li key={d.deal_id}
                  className={'deal-card' + (d.deal_id === selId ? ' active' : '') + (st.dq ? ' dq' : '')}
                  onClick={() => setSelId(d.deal_id)}>
                  <div className="score-badge" style={{ background: scoreColor(d.reengage_score) }}>
                    {Math.round(d.reengage_score)}
                  </div>
                  <div className="deal-main">
                    <div className="deal-name">
                      {d.company}
                      {st.dq && <span className="dq-badge">DQ</span>}
                    </div>
                    <div className="deal-sub">
                      <span className="cat-dot" style={{ background: catMeta(d.reason_category).color }} />
                      {d.reason_category} · {money(d.amount)}
                    </div>
                    <div className="deal-meta">
                      <span className="stage-pill" style={{ background: sm.bg, color: sm.color }}>{st.stage}</span>
                      {os !== 'none' && <span className="stage-pill" style={{ background: om.bg, color: om.color }}>{om.label}</span>}
                      {d.n_emails} em · {d.n_meetings} mtg
                    </div>
                  </div>
                </li>
              )
            })}
            {!filtered.length && <li className="empty">No deals match these filters.</li>}
          </ul>
        </aside>}

        <main className="detail">
          {selected
            ? <DealDetail deal={selected} state={stateOf(selected.deal_id)}
                draft={drafts[selected.deal_id]}
                altCtx={altCtx[selected.deal_id]}
                senderName={senderName}
                onPatch={patch => patchDeal(selected.deal_id, patch)}
                onContact={(key, cpatch) => updateContact(selected.deal_id, key, cpatch)}
                onRemoveContact={key => removeContact(selected.deal_id, key)} />
            : <div className="placeholder">Select a deal to view its activity feed.</div>}
        </main>
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="stat-val">{value}</div>
      <div className="stat-lbl">{label}</div>
    </div>
  )
}
