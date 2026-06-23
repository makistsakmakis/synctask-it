# SyncTask IT — Netlify + SharePoint Lists

IT Implementation Requests Management System (Functional Spec v2.1) as a React SPA
hosted on Netlify, with **your existing SharePoint lists as the database** and
**Office 365 (Entra ID) sign-in**. No separate accounts, no separate data store.

- **Frontend** — React 18 + Vite on Netlify
- **Auth** — MSAL popup sign-in against your tenant; roles derived from the
  Managers / Resources lists + an admin email allow-list
- **Data** — Microsoft Graph against the lists at
  `inventorac.sharepoint.com/sites/ProjectManagement/Development`
- **History** — SharePoint built-in versioning, shown in the History tab (spec §10)
- **Notifications** — your Power Automate flows (spec §18) keep working: the app
  writes the same list fields Power Apps would, so item-change triggers fire normally

## One-time setup

### 1. Entra ID app registration (~10 min, may need tenant admin)
1. Azure portal → **Microsoft Entra ID → App registrations → New registration**
2. Name: `SyncTask IT` · Supported accounts: *single tenant*
3. Platform: **Single-page application (SPA)** · Redirect URI: `http://localhost:5173`
   (add your Netlify URL later as a second redirect URI)
4. **API permissions → Add → Microsoft Graph → Delegated**:
   `User.Read`, `Sites.ReadWrite.All` → **Grant admin consent**
5. Copy the **Application (client) ID** and **Directory (tenant) ID**

> `Sites.ReadWrite.All` is delegated — users can only touch what they can already
> access in SharePoint. For tighter scoping, `Sites.Selected` + granting the app
> access to just this site is the stricter alternative (extra admin steps).

### 2. SharePoint prerequisites
- Versioning enabled on the Requests list (List settings → Versioning)
- Managers list columns: Title (name), `Email`, `Division`
- Resources list columns: Title (name), `Email`
- Requests list: the columns from the Power Apps prototype. Approver and
  Implementors are expected as **text columns holding emails** (Implementors
  semicolon-separated). If yours are Person columns, say so — the mapping layer
  needs a small adjustment.

### 3. Configure and run
```bash
cp .env.example .env     # fill in client ID, tenant ID, site path, list names, admin emails
npm install
npm run dev
```
Sign in, then open **`/diag`** — it reads the live column definitions from your three
lists. Compare the internal names against `src/lib/fields.js` (the app assumes the
known `field_1`/`field_2`/`field_4`/`field_18`/`field_19–23` pattern and infers the
rest from column order). Fix any mismatches in that one file; nothing else changes.

### 4. Deploy to Netlify
Connect the repo (auto-detected via `netlify.toml`) or `npm run build` + drag-drop
`dist/`. Add the same `VITE_*` environment variables in Site settings, and add the
Netlify URL as a redirect URI in the Entra app registration.

## Role behavior (spec §12–§15)
- **Requestor** — own requests; create; edit only while Planned
- **Manager** — own + approval scope; Approve / Reject while Planned; Cancel while Approved
- **Implementor** — assigned requests; Start / On Hold / Complete; execution fields
- **Admin / COO** (emails in `VITE_ADMIN_EMAILS`) — all requests, Assign popup,
  dashboard KPIs (§16), role preview

Confirmation dialogs on every significant action; the Complete popup blocks until
Actual Completion, Actual ManHours and Resolution Summary are provided (SR-04).

## Security model — read this once
Workflow rules and visibility filtering are enforced **in the app**, exactly like
the Power Apps version and as accepted in spec §10 for v1: SharePoint list
permissions are the real boundary, and a user could bypass the app by editing the
list directly. Acceptable for a small trusted user base; a Power Automate flow that
reverts illegal status transitions is a cheap hardening step later.

## Reference numbers and emails
On create, the app writes `ITR-YYYY-MM-DD-000123` (date + zero-padded item ID,
spec §18.1 format). If your Power Automate flow also generates one, the flow's
value wins. Workflow notification emails are the flows' job (§17/§18) — the app
intentionally does not send mail itself. Manual "Message manager / implementors"
buttons open pre-addressed mail drafts (§17.2).
