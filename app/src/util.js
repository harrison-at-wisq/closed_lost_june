// Shared formatting + category styling helpers.

// Re-engagement pipeline stages (Disqualified is a SEPARATE status, not a stage).
export const STAGES = [
  'Not Started',
  'Attempting Contact',
  'Re-Engaged',
  'Meeting Booked',
  'Revived (Open Opp)',
]
export const DEFAULT_STAGE = 'Not Started'

export const STAGE_META = {
  'Not Started':        { color: '#64748b', bg: '#e2e8f0' },
  'Attempting Contact': { color: '#0891b2', bg: '#cffafe' },
  'Re-Engaged':         { color: '#2563eb', bg: '#dbeafe' },
  'Meeting Booked':     { color: '#7c3aed', bg: '#ede9fe' },
  'Revived (Open Opp)': { color: '#16a34a', bg: '#dcfce7' },
}
export function stageMeta(s) { return STAGE_META[s] || STAGE_META['Not Started'] }

// Disqualify reasons — presets plus a free-text "Other".
export const DQ_REASONS = [
  'Not Qualified Anymore',
  'Not Ready',
  'No Budget',
  'Wrong Contact',
  'Other',
]

export const CHANNELS = ['Email', 'LinkedIn', 'Phone', 'Other']

// Derive an account's outreach status from its contact-level "contacted" flags.
// deal.contacts = on-file (main) contacts; st.contacts = per-contact state incl. alternates.
export function outreachStatus(deal, st) {
  const cs = st?.contacts || {}
  const mainContacted = (deal.contacts || []).some(c => cs['c' + c.contact_id]?.contacted)
  const altContacted = Object.entries(cs).some(([, v]) => v?.isAlternate && v?.contacted)
  if (mainContacted && altContacted) return 'both'
  if (mainContacted) return 'main'
  if (altContacted) return 'alternate'
  return 'none'
}

// Account outreach status, derived from contact-level "contacted" flags.
export const OUTREACH_META = {
  none:      { label: 'Not reached', color: '#64748b', bg: '#e2e8f0' },
  main:      { label: 'Main contacted', color: '#0891b2', bg: '#cffafe' },
  alternate: { label: 'Alt contacted', color: '#7c3aed', bg: '#ede9fe' },
  both:      { label: 'Main + alt', color: '#16a34a', bg: '#dcfce7' },
}

const CAMPAIGN_YEAR = 2026 // "now" for phrasing like "back in November last year"

function listJoin(names) {
  if (names.length <= 1) return names[0] || ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// "November 2025" -> "November last year"; "March 2026" -> "March"; older -> "March 2024"
function whenPhrase(monthYear) {
  if (!monthYear) return 'then'
  const m = monthYear.match(/([A-Za-z]+)\s*(\d{4})?/)
  if (!m) return monthYear
  const month = m[1]
  const year = m[2] ? parseInt(m[2], 10) : null
  if (!year) return month
  if (year === CAMPAIGN_YEAR) return month
  if (year === CAMPAIGN_YEAR - 1) return `${month} last year`
  return `${month} ${year}`
}

function monthOnly(monthYear) {
  const m = (monthYear || '').match(/[A-Za-z]+/)
  return m ? m[0] : ''
}

// Softer re-engagement email to the DIRECT (on-file) contact. Mentions secondary
// attendees ("…and Jamie was there as well") only when secondaryNames is non-empty.
export function directEmail({ contactFirst, aeFirst, conversationMonth, functionChallenge, secondaryNames = [], senderName }) {
  const when = whenPhrase(conversationMonth)
  const fc = (functionChallenge || '').trim() || 'transactional HR work'
  const ae = aeFirst || 'a colleague of mine'
  let sec = ''
  if (secondaryNames.length === 1) sec = `, and ${secondaryNames[0]} was there as well`
  else if (secondaryNames.length > 1) sec = `, and ${listJoin(secondaryNames)} were there as well`
  const recap = secondaryNames.length ? 'Mind if I recap what you all discussed?' : 'Mind if I recap what we discussed?'
  const subjMonth = monthOnly(conversationMonth)
  return {
    subject: `recap from your chat with ${ae}${subjMonth ? ` in ${subjMonth}` : ''}`,
    body:
`${contactFirst || 'there'}, you met with my colleague, ${ae}, back in ${when}.
Topic was AI for ${fc}${sec}.
${recap}
${senderName || 'Harrison'}`,
  }
}

// Deterministic string hash so a given contact always gets the same variant
// (otherwise the email would reshuffle on every render).
function hashStr(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
const pick = (arr, seed) => arr[hashStr(seed) % arr.length]

// Build the alternate "warm intro via colleague" email. `seed` (the contact key)
// selects small phrasing variants so the emails aren't identical across contacts.
export function altEmail({ recipientFirst, mainFullName, functionChallenge, senderName, seed = '' }) {
  const fc = (functionChallenge || '').trim() || 'Transactional HR work'
  const who = mainFullName || 'a colleague of yours'

  const recently = pick(['I recently', 'I just', 'I recently'], seed + '|r')
  const verb = pick(['spoke with', 'connected with', 'chatted with'], seed + '|v')
  const prep = pick(['about', 'around', 'on'], seed + '|p')
  const linkedin = pick([
    'I came across your profile on LinkedIn and thought you might find what we covered interesting.',
    'Your profile came up on LinkedIn, and I figured our conversation might be relevant to you.',
    'I spotted your profile on LinkedIn and thought what we discussed could be of interest.',
  ], seed + '|l')
  const signoff = pick(['Best,', 'Thanks,', 'Cheers,'], seed + '|s')

  return {
    subject: `Convo with ${who}`,
    body:
`Hi ${recipientFirst || 'there'},

${recently} ${verb} ${who} ${prep} AI for ${fc}.

${linkedin}

Mind if I share?

${signoff}
${senderName || 'Harrison'}`,
  }
}


export const CATEGORY_META = {
  'Timing':             { color: '#2563eb', bg: '#dbeafe', label: 'Timing' },
  'Unresponsive':       { color: '#d97706', bg: '#fef3c7', label: 'Unresponsive' },
  'Contact / Champion': { color: '#7c3aed', bg: '#ede9fe', label: 'Contact / Champion' },
  'Product Fit':        { color: '#dc2626', bg: '#fee2e2', label: 'Product Fit' },
  'Pricing':            { color: '#0d9488', bg: '#ccfbf1', label: 'Pricing' },
  'Other':              { color: '#64748b', bg: '#e2e8f0', label: 'Other' },
}

export function catMeta(cat) {
  return CATEGORY_META[cat] || CATEGORY_META['Other']
}

export function money(n) {
  if (!n) return '—'
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function scoreColor(s) {
  if (s >= 70) return '#16a34a'
  if (s >= 55) return '#ca8a04'
  return '#94a3b8'
}

// Accepts "2026-04-06 11:17" or ISO; returns a Date or null.
export function toDate(s) {
  if (!s) return null
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'))
  return isNaN(d) ? null : d
}

export function fmtDate(s, withTime = false) {
  const d = toDate(s)
  if (!d) return '—'
  const opts = withTime
    ? { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { year: 'numeric', month: 'short', day: 'numeric' }
  return d.toLocaleDateString('en-US', opts)
}

export function relDays(s, ref = new Date('2026-05-22')) {
  const d = toDate(s)
  if (!d) return null
  return Math.round((ref - d) / 86400000)
}

// Strip the quoted-reply tail from an email body for a cleaner preview.
export function emailLead(body) {
  if (!body) return ''
  const cut = body.search(/\r?\n\s*(From:|On .+wrote:|-----Original)/)
  return (cut > 40 ? body.slice(0, cut) : body).trim()
}

// Pull the Gong "Call brief" sentence out of a meeting body if present.
export function meetingBrief(body) {
  if (!body) return ''
  const m = body.match(/Call brief:\s*<br>\s*(.+?)(<br><br>|Key Discussion)/s)
  if (m) return m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280)
}

export function gongUrl(body) {
  const m = (body || '').match(/href="([^"]*gong\.io[^"]*)"/)
  return m ? m[1] : null
}
