# Legal questions — for counsel

Prepared 2026-08-04, alongside the analytics round (migrations `0013_login_events`,
`0014_user_events`).

**This document is written by a non-lawyer and is not legal advice.** It states
what the system actually does, the position we have provisionally taken, and the
questions we need answered. Where we have assumed something, it is marked
**ASSUMPTION** so it can be confirmed or corrected rather than inherited.

Company: Cloud9 (AI travel planning). Users to date: a handful of test accounts.
Not yet launched. Primary expected users: Israel, with EU visitors likely.

---

## 1. What we collect, and why

### 1a. Sign-in log (`login_events`) — new
Recorded on every sign-in: **user id, timestamp, IP address, browser user-agent,
and whether it is the user's first ever sign-in.**

Purpose: account security, detecting unauthorised access, diagnosing sign-in
failures.

### 1b. Product usage (`user_events`) — new
Seven actions only: creating a trip, searching for flights / hotels / activities,
selecting an offer, saving a favourite, adding an itinerary item. Each row stores
the user id, the trip id, the action, and the **search criteria** (destination,
dates, number of guests, budget band, how many results came back).

Deliberately **not** collected here: IP address, user-agent, and the content of
the user's conversation with the concierge. This is a data-minimisation choice —
the analytics do not need them, so they are not stored in this table at all.

We do **not** log general click activity or page views.

### 1c. Already collected before this round
- **Account**: Google ID, email, name, profile image URL (Google sign-in).
- **Conversations**: the full text of chat messages between the user and the AI
  concierge, retained indefinitely, because they ARE the product — a trip plan is
  its conversation.
- **Trips, favourites, itinerary items** and stated travel preferences.

> **QUESTION 1.** Our provisional legal basis for 1a and 1b is **legitimate
> interest** (GDPR Art. 6(1)(f)) — security for the sign-in log, service
> improvement for the usage events — rather than consent. Do you agree, and do we
> need a written Legitimate Interests Assessment on file?

> **QUESTION 2.** Our reading is that no cookie-consent banner is required for
> this, because the ePrivacy rules concern storing or reading information **on the
> user's device**, and all of the above is server-side logging of requests the
> user initiated. The only cookie we set is the authentication session, which we
> treat as strictly necessary and therefore exempt. Is that correct?

> **QUESTION 3.** Chat message content is retained **indefinitely** and is far
> more revealing than the analytics rows (travel plans, dates, companions, budget).
> Does that need its own basis, its own retention period, or explicit notice
> beyond the privacy policy?

---

## 2. Retention

| Data | Retention | Mechanism |
|---|---|---|
| `login_events` (incl. IP, user-agent) | **12 months** | automatic nightly delete (`pg_cron`) |
| `user_events` | **12 months** | automatic nightly delete (`pg_cron`) |
| Aggregated statistics derived from the above | indefinite | no longer identifies anyone |
| Chat messages, trips, favourites | **indefinite** | none — deleted only with the account |
| Automated database backups | 7 days | Supabase Pro |
| Manual database dumps | until deleted by hand | stored off-platform by the founder |

> **QUESTION 4.** Is 12 months appropriate for the sign-in log and usage events,
> or should either be shorter? Is "aggregates kept indefinitely" acceptable as
> drafted, given the aggregates do not identify individuals?

> **QUESTION 5.** Manual database dumps contain **all user data including chat
> content**, and are stored off-platform (external drive / private cloud). What
> are our obligations for those copies — encryption, retention limit, register
> entry?

---

## 3. Deletion and the right to erasure

**Current state, stated plainly: there is NO self-serve account deletion in the
app.** Deletion is a manual database operation performed by the founder on
request.

The database is built so that one statement removes everything:

```sql
-- Deletes the user and, by cascade: chat messages, trips, favourites,
-- timeline items, login events and usage events.
delete from public.users where id = '<user-uuid>';
```

**Known blocker.** `hotel_reviews` is the only table whose foreign keys are
**not** `on delete cascade`. If the user has written a review, the statement
above fails with a foreign-key violation, and their reviews must be handled
first. The table is empty today, so this has never triggered — but it will the
moment reviews ship.

```sql
-- Required first, once reviews exist:
delete from public.hotel_reviews where user_id = '<user-uuid>';
```

> **QUESTION 6.** How quickly must we action a deletion request, and does a
> manual process satisfy the requirement in the short term while we build
> self-serve deletion?

> **QUESTION 7.** For **verified reviews** written by a user who then asks for
> erasure — must the review be deleted, or may it be anonymised and retained
> (the review being useful to other travellers)? This determines whether we
> change that foreign key to cascade or to `set null`.

> **QUESTION 8.** Deleted rows persist in database backups for up to 7 days, and
> potentially longer in manual dumps. Is that acceptable, and does it need
> describing in the policy?

---

## 4. Third parties and international transfers

User data leaves our systems in the following ways:

| Recipient | What they receive | Where |
|---|---|---|
| **Anthropic** | The full text of chat messages, to generate replies | United States |
| **Supabase** | Everything (database host) | EU — `eu-west-1` (Ireland) |
| **Vercel** | Application hosting; request metadata incl. IP | US company, edge network |
| **Google** | Authentication (sign-in) | US |
| **Hotelbeds** | Search criteria: destination coordinates, dates, party size | Spain |
| **Mapbox** | Map tile requests from the user's browser | US |

> **QUESTION 9.** Chat content going to **Anthropic in the US** is the most
> significant transfer. What do we need — Standard Contractual Clauses, a
> transfer impact assessment, specific notice in the policy?

> **QUESTION 10.** Which of these require a signed **Data Processing Agreement**,
> and can you confirm which ones offer a standard DPA we should execute?

---

## 5. Israeli law

> **QUESTION 11.** How does the **Privacy Protection Law, 5741-1981, as amended
> by Amendment 13** apply to us? We are flagging its relevance rather than
> interpreting it. Specifically:
> - Do we have a **database registration** duty, or an exemption?
> - What are our **security** obligations at our scale, and what documentation
>   must exist?
> - Do we need a designated **privacy or security officer**?
> - What are the **breach notification** duties and timelines?

> **QUESTION 12.** We expect users in both Israel and the EU. Should the privacy
> policy be written to the stricter standard throughout, or should it distinguish?

> **QUESTION 13.** Is there a **minimum age** we must state, and do we need any
> age check? The service has no age gate today.

---

## 6. Draft privacy-policy wording

Drafted by a non-lawyer as a starting point — please rewrite as needed.

> **Information we collect automatically.** When you sign in, we record the date
> and time, your IP address, and your browser's user-agent string. We use this to
> secure your account, detect unauthorised access, and diagnose sign-in problems.
>
> **Usage information.** We record certain actions you take in the service —
> creating a trip, searching for flights, hotels or activities, selecting an
> offer, saving a favourite, and adding an item to your itinerary — together with
> the search criteria you entered, such as destination and dates. We do not
> record the content of your conversations with the concierge for analytics
> purposes.
>
> **Your conversations.** Your messages to the travel concierge are stored so
> that your trip plans remain available to you, and are sent to our AI provider
> in order to generate replies.
>
> **Why we process this information.** We rely on our legitimate interests in
> operating, securing and improving the service. You may object to this
> processing at any time by contacting us at [ADDRESS].
>
> **How long we keep it.** Sign-in records and usage records are deleted
> automatically 12 months after they are created. Aggregated statistics that do
> not identify you may be kept for longer. Your account information, trips and
> conversations are kept until you ask us to delete your account.
>
> **Deletion.** You can ask us to delete your account at any time by contacting
> us at [ADDRESS]. We will delete your account information, trips, conversations,
> favourites and the records described above. Copies may remain in encrypted
> backups for a short period afterwards.
>
> **Who we share it with.** We use service providers to host the application and
> database, to authenticate sign-in, to generate concierge replies, and to supply
> travel inventory. Some are located outside your country. We share the minimum
> necessary for each purpose and never sell your information.

> **QUESTION 14.** Please confirm this covers what it must, and tell us what is
> missing — in particular whether the list of recipients must name each provider.

---

## Open items on our side (not questions for counsel)

- [ ] **Self-serve account deletion** — pre-launch, not a nice-to-have. Tracked
      in `CLAUDE.md` TODOs.
- [ ] Resolve the `hotel_reviews` foreign key once Q7 is answered.
- [ ] Enable `pg_cron` and schedule the 12-month purge (SQL in `0014`).
- [ ] Publish a privacy policy before soft launch.
- [ ] Provide a contact address for privacy requests.
