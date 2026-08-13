# East coast partner prospects — named people, not shop inboxes

Built 2026-08-09. Companion to OUTREACH_TRACKER.csv (that file stays the live log;
this one is the prospect pool).

---

## Read this first: what actually made U Tea say yes

Worth being precise, because it changes who to write to.

`uteausa2018@gmail.com` — the address that converted — **is a generic shop inbox**,
the same species as `sweetnsaltystore@gmail.com`, `hanatea808@gmail.com` and
`cowcowstea@gmail.com`, which got 0 replies in five weeks. So the address type was
not the variable.

What was different: Melchi had been in the shop that day, a staff member told him
to write to that address, and the email said so in the first two lines.

Remotely there is no staff referral. The closest substitutes, in order of strength:

1. **A real person's name in the greeting.** "Hi Qing Yu Lin" is a different email
   from "Hi there." This file exists to supply that.
2. **One specific true detail about that shop** that could not be copy-pasted to
   another shop (their signature drink, the fundraiser that saved them, the fact
   they are the only one open until 2am).
3. **A reason he is writing to them and not to fifty shops.** College town, student
   customers, a Cornell student who built the thing.

Do not send anything that would still read correctly with the shop name swapped.
That is the thing the Hawaii batch had in common.

---

## The method (reusable — this is how the names were found)

New York publishes every active corporation, including the **person designated to
receive legal service**, which for a one-shop business is almost always the owner.
Free, no key, no scraping:

```bash
curl -s --get "https://data.ny.gov/resource/n9v6-gdp6.json" \
  --data-urlencode '$where=county in("Onondaga") AND upper(current_entity_name) like "%BOBA%"' \
  --data-urlencode '$limit=100'
```

Query notes that cost time:
- County values are **title case** (`"Onondaga"`, not `"ONONDAGA"`), and the county
  filter must live **inside `$where`** — passing it as a separate param alongside
  `$where` silently drops it and returns the whole state.
- `like "%TEA%"` matches TEAM, HOMESTEAD, STEAK. Filter `\b(TEA|BOBA|CHA)\b` after.
- A `dos_process_name` equal to the entity name, or ending in INC/LLC/ESQ, is a
  registered-agent service, not a person. Skip those.

**Caveats, so nothing here gets over-trusted:** the registry gives a NAME, not an
email and not a job title. It is the owner or their lawyer, not necessarily the
person behind the counter, and filings go stale when a business is sold. Treat
every name as "ask for this person," verified on the call, not as a confirmed
manager. Other states each have their own registry (PA, NJ, MA, CT all publish
something similar) — not yet pulled.

---

## Tier A — named owner AND a contact already in hand

| Shop | Town / school | Person | Contact | Notes |
|---|---|---|---|---|
| Möge Tee College Park | College Park MD · UMD | **Silvia Kim** (press also spells it Sylvia — confirm on the call) | `mogetee.collegepark@gmail.com` · (240) 965-7871 | 8150 Baltimore Ave Ste B. Franchise badge but independently owned and operated by Kim; she cuts and blends fresh fruit herself. Closest analogue to U Tea in the whole list. |
| Akihi Bubble Tea | New Brunswick NJ · Rutgers | — (no human on file yet) | `support@akihi.us` | 48 College Ave, on campus. 7 NJ locations, so this is a small-chain ask, not a founding-shop ask. Has a franchising page, meaning they think about expansion. |

## Tier B — named owner, contact still to find (call and ask for them)

| Shop | Town / school | Person | Why them |
|---|---|---|---|
| Dream Tea & Poké | **Ithaca** · Cornell | Qing Yu Lin *(state filing only, do not ask for by name)* | Single location, principal office IS the shop, IG under the owner's own name. Hands-on owner. Walk in as a customer; the name is for recognition, not for asking. |
| Loose Leaf Boba Co. | New Haven CT · Yale | **Lisa Satavu** (of North Haven) | 46 High St, inside The Shops at Yale. Owner-founded, all-natural/organic angle, single shop. (475) 441-8361 |
| LimeRed Teahouse | Amherst + Northampton + Boston MA · UMass/BU | **Joe Deng** | 3 shops, owner named on their own site. Amherst store is 50 Main St, downtown. Sustainability/artisanal positioning. |
| Boba King | Philadelphia PA · Drexel/Penn | **Moses Choi, Dustin Park, Sun Son** | 3200 Chestnut St, University City. Founded by three friends who missed Korean-quality drinks; they make boba in-shop from scratch. IG @bobaking.usa |
| Teadori | State College PA · Penn State | owner not yet named (Californian transplant) | 454 E College Ave. **Nearly closed, and the town raised $10k in a week to save them** — a shop whose whole model is community reciprocity. Strongest story fit in the file. Open to 2am. (814) 699-9266 |
| Syracuse Snow Tea Shop | Syracuse NY · SU | **Xue Fang Jiang** | Filed in **13210**, the Marshall St campus zip. |
| Hi Tea | Syracuse NY · SU | — (locally owned since 2018) | 167 Marshall St, right on the student strip. (315) 901-2990 |
| Rochester Taichi Bubble Tea | Rochester NY · U of R | **Qingke Xia** | 14620, next to U of R. |
| Tai Chi Tea Inc. | Rochester NY · RIT | **Zongpeng Quyang** | 14623, the RIT zip. |
| Smootea | East Amherst NY · UB North | **Chenxi Yu & Lin Wei Zheng** | Two named owners, UB's north campus side. |
| Milk and Tea Cafe | Buffalo NY · UB | **Van Nguyen** | 14216. |
| Boba Stop | Depew NY · UB commuter belt | **Tom Nguyen** | |
| Crave Bubble Tea Cafe | Williamsville NY · UB | **Laura Walker** | |
| Cloud Boba | Schenectady NY · Union College | **Win Cheung** | 12309. |
| Sweet Tea Talk | Stony Brook NY · SBU | **Wenren Lin** | Filed in 11790, the campus zip. |
| Tea Brew Management | Stony Brook NY · SBU | **Jian Jiang** | 11790. |
| Hudson Poke and Boba | Poughkeepsie NY · Vassar/Marist | **Alvis Yee** | 12601. |
| Black Girl Boba | Latham NY · SUNY Albany belt | **Tyahna Thomas** | |
| Joyful Boba | Liverpool NY · Syracuse suburb | **Bhuwan Basnet** | Suburb, not the student strip. Lower priority. |
| Mist Tea Cafe | Kirkville NY · Syracuse suburb | **Khoa Nguyen** | Same caveat. |
| The Boba Life | Apalachin NY · ~15 min from Binghamton | **Laura Howell** | |
| We Tea Garden | Vestal NY · **Binghamton University** | — (no human on file) | Vestal is the BU town. Closest real college-town target to Ithaca in this file. |

## Worth re-checking: Taichi may not need corporate after all

The tracker skips Taichi Bubble Tea as a "50+ location chain needing corporate
approval." But the registry shows **ITHACA TAICHI TEA INC.**, **ROCHESTER TAICHI
BUBBLE TEA INC** and **78 TAICHI TEA, INC.** (Erie) as *separate New York
corporations*, and the Rochester one names a human owner (Qingke Xia). That is a
franchise pattern where the local operator may well be able to say yes on their own
store. Worth one question at the Ithaca counter (215 E State St, on the Commons)
rather than a blanket skip.

## Ithaca Commons, for this week's walk

- **Taichi Bubble Tea** — 215 E State St (Commons). Ask whether the owner of *this*
  store can approve it, per the note above.
- **Dream Tea & Poké** — 130 E Seneca St, by the Commons. Single location, and the
  registered office is the shop itself, so the owner is likely working it.
  **Do NOT walk in asking for Qing Yu Lin by name.** That name comes off a state
  filing, not from knowing the person, and demanding a stranger by their legal name
  reads like a process server. Just do what worked at U Tea: buy something, talk to
  whoever is there, ask if the owner is around or how to reach them. The name is
  only useful for recognising it if THEY offer it.
- **Sushi Osaka** — 113 E State St. Serves boba, already on the app's map.
