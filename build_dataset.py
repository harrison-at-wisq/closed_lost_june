#!/usr/bin/env python3
"""Join the four HubSpot exports into one enriched, per-deal dataset for the web app.

Linkage strategy (the raw files have no deal_id foreign key on emails/meetings):
  - contacts -> deals: by contact_id (clean)
  - emails   -> deals: by counterparty email domain found in sender/body/subject
  - meetings -> deals: by company-name token match in title/body, with domain as backup

Also computes a reason_category and a 0-100 re-engage "warmth" score per deal.
"""
import json, re, html
from collections import Counter, defaultdict
from datetime import datetime

HERE = "/Users/harrison/Desktop/VSCode Projects/closed_lost_june"

deals = json.load(open(f"{HERE}/closed_lost_reengage_75_deals_full_export (1).json"))["deals"]
emails = json.load(open(f"{HERE}/emails_all (1).json"))
meetings = json.load(open(f"{HERE}/meetings_all (2).json"))
contacts = json.load(open(f"{HERE}/contacts_all (1).json"))

GENERIC_DOMAINS = {
    "wisq.com", "gmail.com", "googlemail.com", "outlook.com", "hotmail.com",
    "yahoo.com", "icloud.com", "aol.com", "me.com", "gong.io",
}

def num(s):
    try:
        return float(str(s).replace(",", "").strip())
    except Exception:
        return None

def parse_dt(s):
    if not s:
        return None
    s = s.strip()
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None

def domains_in(*texts):
    out = set()
    for t in texts:
        out |= set(re.findall(r"@([a-z0-9.\-]+\.[a-z]{2,})", (t or "").lower()))
    return out

# ---- reason categorization -------------------------------------------------
def categorize(reason):
    r = (reason or "").lower()
    if "unresponsive" in r:
        return "Unresponsive"
    if "timing" in r:
        return "Timing"
    if "pricing" in r or "budget" in r or "expensive" in r:
        return "Pricing"
    if "product" in r or "feature" in r or "integration" in r:
        return "Product Fit"
    if "contact" in r or "stakeholder" in r or "buy-in" in r:
        return "Contact / Champion"
    return "Other"

# Revival potential by category (how recoverable a loss reason is)
CATEGORY_WEIGHT = {
    "Timing": 1.00,
    "Unresponsive": 0.80,
    "Contact / Champion": 0.65,
    "Product Fit": 0.45,
    "Pricing": 0.45,
    "Other": 0.40,
}

POS_WORDS = ["interested", "alignment", "align", "circle back", "be in touch",
             "reach out", "next year", "follow up", "revisit", "keep in touch",
             "stay in touch", "down the road", "love to", "great", "excited"]
NEG_WORDS = ["not interested", "no longer", "decided to", "went with", "passing",
             "unfortunately", "no budget", "not a fit", "no longer pursuing"]

# ---- normalize company names for meeting matching --------------------------
STOP = {"inc", "llc", "corp", "corporation", "co", "company", "group", "ltd",
        "the", "and", "services", "service", "of", "&",
        # generic geo / industry words that collide across different companies
        "america", "americas", "north", "south", "east", "west", "international",
        "global", "national", "restaurant", "restaurants", "holdings", "industries",
        "brands", "solutions", "technologies", "systems", "foods", "supply",
        "new", "deal", "poc", "ee", "ees"}

def name_tokens(name):
    toks = re.findall(r"[a-z0-9]+", (name or "").lower())
    # allow 2-letter tokens (e.g. "EG") but drop generic words and pure numbers
    return {t for t in toks if t not in STOP and len(t) >= 2 and not t.isdigit()}

# ---- index contacts by id --------------------------------------------------
contacts_by_id = {c["contact_id"]: c for c in contacts}

# map a contact full-name -> set of deal indices (for meeting attendee matching)
WISQ_REPS = {"alex macaulay", "fraser aitken", "marc lombardo"}
contact_name_to_deal = defaultdict(set)
for di, d in enumerate(deals):
    for c in d.get("associated_contacts", []):
        full = contacts_by_id.get(c["contact_id"], c)
        fn = (full.get("firstname") or "").strip().lower()
        ln = (full.get("lastname") or "").strip().lower()
        if fn and ln:
            contact_name_to_deal[f"{fn} {ln}"].add(di)

# ---- pre-extract email domains + datetimes ---------------------------------
for em in emails:
    em["_dt"] = parse_dt(em.get("timestamp"))
    doms = domains_in(em.get("sender"), em.get("body_preview"), em.get("subject"))
    em["_counterparty_domains"] = {d for d in doms if d not in GENERIC_DOMAINS}

for mt in meetings:
    mt["_dt"] = parse_dt(mt.get("start_time"))
    # Only the TITLE reliably names the company (e.g. "Wisq & Baker Roofing").
    # The Gong body summary contains generic words that cause false matches.
    mt["_title_low"] = html.unescape(mt.get("title", "")).lower()
    mt["_domains"] = {d for d in domains_in(mt.get("body")) if d not in GENERIC_DOMAINS}

# ---- build per-deal records ------------------------------------------------
enriched = []
email_assigned = Counter()
meeting_assigned = Counter()

for d in deals:
    csv = d.get("csv_data", {})
    domain = (csv.get("company_domain") or "").lower().strip()
    company = csv.get("company_name") or d.get("deal_name", "")
    toks = name_tokens(company)
    # this deal's contact full-names, for meeting-attendee fallback matching
    my_contact_names = [
        f"{(contacts_by_id.get(c['contact_id'], c).get('firstname') or '').strip().lower()} "
        f"{(contacts_by_id.get(c['contact_id'], c).get('lastname') or '').strip().lower()}".strip()
        for c in d.get("associated_contacts", [])
    ]
    my_contact_names = [n for n in my_contact_names if len(n) > 1 and n not in WISQ_REPS]

    # emails: counterparty domain matches deal domain
    d_emails = []
    if domain:
        for em in emails:
            if domain in em["_counterparty_domains"]:
                d_emails.append(em)
                email_assigned[em["id"]] += 1

    # meetings: domain match OR >=1 distinctive company token in title/body
    d_meetings = []
    for mt in meetings:
        hit = (domain and domain in mt["_domains"])
        if not hit and toks:
            hit = any(re.search(rf"\b{re.escape(t)}\b", mt["_title_low"]) for t in toks)
        if not hit and my_contact_names:  # attendee name in title (person-titled Gong calls)
            hit = any(n in mt["_title_low"] for n in my_contact_names)
        if hit:
            d_meetings.append(mt)
            meeting_assigned[mt["id"]] += 1

    # contacts (already embedded; enrich from contacts_all by id)
    cts = []
    for c in d.get("associated_contacts", []):
        full = contacts_by_id.get(c["contact_id"], c)
        cts.append({**c, **{k: v for k, v in full.items() if v}})

    # attribute an activity to one of the deal's contacts (by email, then full name)
    def attribute_person(text):
        t = (text or "").lower()
        for c in cts:
            em = (c.get("email") or "").lower()
            if em and em in t:
                return {"contact_id": c.get("contact_id"),
                        "name": f"{c.get('firstname','')} {c.get('lastname','')}".strip()}
        for c in cts:
            fn = (c.get("firstname") or "").strip().lower()
            ln = (c.get("lastname") or "").strip().lower()
            if fn and ln and f"{fn} {ln}" in t:
                return {"contact_id": c.get("contact_id"),
                        "name": f"{c.get('firstname','')} {c.get('lastname','')}".strip()}
        return None

    # build a merged, sorted activity feed
    feed = []
    for em in d_emails:
        person = attribute_person(
            f"{em.get('sender','')} {em.get('subject','')} {em.get('body_preview','')}")
        feed.append({
            "type": "email",
            "id": em["id"],
            "dt": em["_dt"].isoformat() if em["_dt"] else None,
            "direction": em.get("direction"),
            "subject": em.get("subject"),
            "sender": em.get("sender"),
            "body": em.get("body_preview"),
            "person": person,
        })
    for mt in d_meetings:
        person = attribute_person(f"{mt.get('title','')} {mt.get('body','')}")
        feed.append({
            "type": "meeting",
            "id": mt["id"],
            "dt": mt["_dt"].isoformat() if mt["_dt"] else None,
            "title": mt.get("title"),
            "body": html.unescape(mt.get("body", "")),
            "end_time": mt.get("end_time"),
            "person": person,
        })
    feed.sort(key=lambda x: x["dt"] or "", reverse=True)

    # ---- re-engage score ---------------------------------------------------
    reason = csv.get("closed_lost_reason")
    cat = categorize(reason)
    amount = num(csv.get("amount")) or 0
    last_act = parse_dt(csv.get("last_activity_date"))

    # recency: 0 (>1yr) .. 1 (very recent), relative to export date 2026-05-22
    REF = datetime(2026, 5, 22)
    recency = 0.3
    if last_act:
        days = (REF - last_act).days
        recency = max(0.0, min(1.0, 1 - days / 365))

    # sentiment of most recent INCOMING email
    sentiment = 0.0
    incoming = [e for e in d_emails if e.get("direction") == "INCOMING_EMAIL" and e["_dt"]]
    incoming.sort(key=lambda e: e["_dt"], reverse=True)
    last_in = incoming[0] if incoming else None
    if last_in:
        b = (last_in.get("body_preview") or "").lower()
        pos = sum(w in b for w in POS_WORDS)
        neg = sum(w in b for w in NEG_WORDS)
        sentiment = max(-1.0, min(1.0, (pos - 2 * neg) / 3))

    # amount factor: 0..1 scaled to 500k
    amt_factor = min(1.0, amount / 500000)

    score = 100 * (
        0.45 * CATEGORY_WEIGHT.get(cat, 0.4)
        + 0.25 * recency
        + 0.15 * ((sentiment + 1) / 2)
        + 0.15 * amt_factor
    )

    enriched.append({
        "deal_name": d.get("deal_name"),
        "deal_id": d.get("hubspot_deal_id"),
        "hubspot_url": d.get("hubspot_url"),
        "company": company,
        "domain": domain,
        "industry": csv.get("primary_industry"),
        "employees": csv.get("number_of_employees"),
        "owner": csv.get("deal_owner"),
        "amount": amount,
        "close_date": csv.get("close_date"),
        "create_date": csv.get("create_date"),
        "last_activity_date": csv.get("last_activity_date"),
        "closed_lost_reason": reason,
        "reason_category": cat,
        "next_step_notes": csv.get("next_step_notes"),
        "contacts": cts,
        "feed": feed,
        "n_emails": len(d_emails),
        "n_meetings": len(d_meetings),
        "last_incoming_preview": (last_in.get("body_preview") if last_in else None),
        "reengage_score": round(score, 1),
        "score_factors": {
            "reason_weight": CATEGORY_WEIGHT.get(cat, 0.4),
            "recency": round(recency, 2),
            "sentiment": round(sentiment, 2),
            "amount_factor": round(amt_factor, 2),
        },
    })

enriched.sort(key=lambda x: x["reengage_score"], reverse=True)

out = {
    "generated_from": "HubSpot CRM - Wisq Portal (21694412)",
    "campaign": "Closed Lost Re-Engage - May 2026 - Deskless",
    "n_deals": len(enriched),
    "deals": enriched,
}
json.dump(out, open(f"{HERE}/app/public/enriched_deals.json", "w"), indent=2)

# ---- coverage report -------------------------------------------------------
print(f"deals: {len(enriched)}")
print(f"emails assigned to >=1 deal: {len(email_assigned)}/{len(emails)} "
      f"(multi-matched: {sum(1 for v in email_assigned.values() if v>1)})")
print(f"meetings assigned to >=1 deal: {len(meeting_assigned)}/{len(meetings)} "
      f"(multi-matched: {sum(1 for v in meeting_assigned.values() if v>1)})")
print(f"deals with 0 activity: {sum(1 for d in enriched if not d['feed'])}")
print("reason categories:", dict(Counter(d["reason_category"] for d in enriched)))
print("score range:", min(d['reengage_score'] for d in enriched),
      "->", max(d['reengage_score'] for d in enriched))
print("\nTop 5 re-engage candidates:")
for d in enriched[:5]:
    print(f"  {d['reengage_score']:5}  {d['deal_name'][:40]:40} {d['reason_category']:12} "
          f"emails={d['n_emails']} mtgs={d['n_meetings']}")
