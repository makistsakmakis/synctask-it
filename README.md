# SyncTask — Vercel + SharePoint Lists

Task & project management as a React SPA hosted on Vercel, with **existing
SharePoint lists as the database** and **Office 365 (Entra ID) sign-in**.
No separate accounts, no separate data store.

- **Frontend** — React 18 + Vite on Vercel (`vercel.json` handles SPA rewrites)
- **Auth** — MSAL full-page redirect sign-in against your tenant; roles derived
  from the Managers / Resources lists + an admin email allow-list
- **Data** — Microsoft Graph against the lists at
  `inventorac.sharepoint.com/sites/ProjectManagement/Development`:
  **Tasks** (shared with the Power Apps app), **Projects**, **Tags**,
  **Managers**, **Resources**
- **History** — SharePoint built-in versioning, shown in the History tab
- **Notifications** — Power Automate flows keep working: the app writes the same
  list fields Power Apps would, so item-change triggers fire normally

## Status model

Statuses are the real SharePoint "Tasks" choice values:
`Not Started · In Progress · Waiting · Deferred · Completed`.
"Open" = anything not Completed; "Overdue" = open with DueDate in the past.

## Roles

Derived at sign-in from the reference lists (see `src/App.jsx`):

- **Admin / COO** — email in `VITE_ADMIN_EMAILS` or `Is_SuperUser` flag: all
  fields editable, Tasks Dashboard + Tasks Kanban, role preview
- **Manager** — in Managers list or `Is_Manager` flag: broad field edit rights
- **Implementor** — `Is_Implementor` (or any Resources row): execution fields
- **Requestor** — everyone else: request fields only

Field-level edit rights per role live in `RIGHTS` in `src/pages/RequestForm.jsx`.

## One-time setup

### 1. Entra ID app registration (~10 min, may need tenant admin)
1. Azure portal → **Microsoft Entra ID → App registrations → New registration**
2. Name: `SyncTask` · Supported accounts: *single tenant*
3. Platform: **Single-page application (SPA)** · Redirect URI: `http://localhost:5173`
   (add your Vercel URL later as a second redirect URI)
4. **API permissions → Add → Microsoft Graph → Delegated**:
   `User.Read`, `Sites.ReadWrite.All` → **Grant admin consent**
5. Copy the **Application (client) ID** and **Directory (tenant) ID**

> `Sites.ReadWrite.All` is delegated — users can only touch what they can already
> access in SharePoint. For tighter scoping, `Sites.Selected` + granting the app
> access to just this site is the stricter alternative (extra admin steps).

### 2. SharePoint prerequisites
- Versioning enabled on the Tasks list (List settings → Versioning)
- Managers list: `Title` (name) + `Manager` (person)
- Resources list: `Title` (name) + `Resource` (person) + `Is_Manager`,
  `Is_Implementor`, `Is_SuperUser` flags
- Tasks list: the columns from the Power Apps app ("Inventor Project Tasks
  Lite v4") — mapping in `src/lib/fields.js`
- Projects list: mapping in `src/lib/projects.js` (note: the Status column reads
  as `OData__Status` and writes as `_Status`; resolved automatically)

### 3. Configure and run
```bash
cp .env.example .env     # fill in client ID, tenant ID, site path, list names, admin emails
npm install
npm run dev
```
Sign in, then open **`/diag`** — it reads the live column definitions from the
lists, probes person resolution, and dumps sample item fields. Compare the
internal names against `src/lib/fields.js`; fix any mismatches in that one file.

### 4. Deploy to Vercel
Connect the repo (auto-detected via `vercel.json`) or `npm run build` + deploy
`dist/`. Add the same `VITE_*` environment variables in Project settings, and add
the Vercel URL as a redirect URI in the Entra app registration.

## Security model — read this once
Role rules and visibility filtering are enforced **in the app**: SharePoint list
permissions are the real boundary, and a user could bypass the app by editing the
list directly. Acceptable for a small trusted user base; a Power Automate flow
that reverts illegal changes is a cheap hardening step later. Rich-text fields
(project Notes) are sanitized client-side before rendering.

## Emails
Workflow notification emails are the Power Automate flows' job — the app
intentionally does not send mail itself. Manual "Message manager / implementors"
buttons open pre-addressed mail drafts.
