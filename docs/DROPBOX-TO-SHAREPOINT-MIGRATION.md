# Dropbox → SharePoint Migration Runbook (Wilco)

**Scope:** Entire Dropbox Business / team (all team folders + member folders) → Microsoft 365 (SharePoint, OneDrive, Teams)
**Tool:** Microsoft 365 **Migration Manager** (built-in Dropbox connector) — supported, no custom code
**Audience:** MSP migration engineer running the Wilco cutover

> **Status:** This is an operational runbook. The `omzig-m365-zero-trust` codebase does **not** perform content migration — it deploys M365 *security* configuration only. There is no Dropbox connector or migration function in this repo, and no pre-existing Dropbox connection. The migration described here is performed in the **Microsoft 365 admin center**, not by this solution's Azure Functions.

---

## ⚠️ Read first: "the existing connection" — two different things

There are **two** unrelated Dropbox integrations in Microsoft 365. They are easy to confuse, and only one migrates content:

| Integration | What it does | Use for Wilco migration? |
|-------------|--------------|--------------------------|
| **Migration Manager** (SharePoint Migration) | **Copies** Dropbox files/folders/permissions into SharePoint/OneDrive/Teams. | ✅ **Yes — this runbook.** |
| **Dropbox Microsoft 365 Copilot connector** | **Indexes** Dropbox content so Copilot/Microsoft Search can *find* it. Content stays in Dropbox; nothing is moved. | ❌ No. Not a migration tool. |

If "the existing connection" you were thinking of is a **Copilot connector** (the Dropbox app-key/app-secret OAuth connector under Search & Intelligence), **it cannot be reused** to move data. Migration Manager establishes its **own** connection by signing into a Dropbox **admin** account during Step 1 below. Confirm which one exists before assuming anything is reusable.

---

## Prerequisites

### Microsoft 365 (destination)
- An account with one of:
  - **Microsoft 365 Migration Administrator** role (least privilege — recommended), or
  - SharePoint/OneDrive Administrator, or Global Administrator.
- Destination SharePoint sites and/or Teams created **before** migration (Migration Manager can create sites, but pre-creating gives you control over naming, hub association, and the Zero Trust labels/policies this solution deploys).
- If migrating any content to **OneDrive**: **pre-provision OneDrive** for the target users first, or those destinations fail validation. See [pre-provision OneDrive](https://learn.microsoft.com/SharePoint/pre-provision-accounts).
- Sufficient SharePoint/OneDrive storage quota for the full Dropbox data volume.

### Dropbox (source)
- A **Dropbox for Business team admin** account with **Read** access to every member/team folder in scope (Step 1 signs in with this account and grants Microsoft the listed individual + team permissions).
- Inventory of Dropbox team folders and member folders (used for task sizing — see limits below).

### Sequencing with this solution
Run the Zero Trust deployment for the Wilco tenant **before** the final migration where practical, so migrated content lands into an environment that already has DLP, sensitivity labels, and SharePoint external-sharing policy applied (`functions/Deploy-Collaboration`, `bicep/data`). At minimum, confirm SharePoint external sharing isn't so restrictive that it blocks the destination sites.

---

## Limits & constraints (plan around these)

| Constraint | Limit | Implication for Wilco |
|------------|-------|-----------------------|
| Rows (tasks) in a scan list | **50,000 max** | Whole-team scope may need multiple projects/passes if folder count is huge. |
| Per migration task size | **≤ 100,000 items and ≤ 1 TB** (recommended) | Large team/member folders must be **split** into sub-tasks by root folder (CSV upload). |
| Single file size | **< 250 GB** | Files at/over the limit won't migrate. |
| SharePoint file/path restrictions | [SharePoint limits](https://go.microsoft.com/fwlink/?linkid=846724) | Illegal names/paths/blocked types fail at file level. |

### What migrates vs. what does NOT (Dropbox for Teams)

**Migrates:** documents; file/folder structure; user- and group-level folder *and* file permissions; files < 250 GB; basic metadata (Created/Modified date, Created by, Last modified by); shared team folders and content owned by the migrated accounts.

**Does NOT migrate:** version history, ownership history, and comments; file/folder descriptions; advanced metadata; file lock attributes; embedded-URL rewriting; trashed items; **unmounted** Dropbox folders; deleted/disconnected users; **Dropbox Paper, Showcases, Spaces**; Apps and Favorites (Pins/Stars); content **not owned** by the migrated account; permissions/metadata of **guests**.

> **Action for Wilco:** Set client expectations now on the "does not migrate" list — especially **version history**, **Dropbox Paper**, and **guest permissions**. Use Dropbox reports to identify guest-shared content; end users must re-share with guests after migration.

---

## Migration steps (Migration Manager)

Entry point: **Microsoft 365 Admin Center → Setup → [Migration and imports](https://admin.microsoft.com/#/featureexplorer/collections/Migrations) → Dropbox** → create a migration project.

### Step 1 — Connect to Dropbox
1. On the project page select **Connect to Dropbox**.
2. In the *Connection and quick settings* wizard, select **Sign in to Dropbox** and sign in with the **Dropbox team admin** account.
3. Select **Allow** to grant Microsoft the listed individual + team permissions.
4. Configure key **project settings** (see below), then **Next** → **Finish**.

**Project settings to set for Wilco (review before scanning):**
- **File permissions migration:** enable if Wilco needs file-level permissions preserved (default migrates *folder* permissions only; files inherit parent folder). Note this **slows** migration.
- Identity-mapping behavior, conflict/overwrite behavior, and notifications.
- When SharePoint document **library** is the destination, the source **root folder** permissions are *not* migrated — create a folder inside the library and target that folder instead to preserve them.

### Step 2 — Scan and assess
1. **Add folders** → choose **All new folders** (autodiscover the whole team) for full scope, or **Multiple specific folders** via CSV for controlled batches.
2. Choose **Automatically start scanning now** (or scan later, then select rows → **Scan**).
3. When scans complete, download the **Scan summary** and **Scan detailed** reports. Triage:
   - Task-level issues → **status code** in the summary report.
   - File-level issues → **failure code (`ResultCode`)** in the detailed report.
4. **Split oversized folders:** any team/member folder > 100,000 items or > 1 TB — delete the task, re-add via **Multiple specific folders** CSV broken out by root subfolder, e.g.:
   ```
   MemberFolder01@wilco.com/folder01
   MemberFolder01@wilco.com/folder02
   MemberFolder01@wilco.com/folder03
   ```

### Step 3 — Copy to Migrations list
1. In **Folders**, select tasks with scan status **Ready to migrate** (or Completed).
2. **Copy to Folder migrations** → set **Destinations** (single edit or CSV) and review **Task migration settings** (inherit Project settings or customize).
3. **Copy to Folder migrations** to send them to the **Folder migrations** tab.

### Step 4 — Review destination paths
Confirm every task has a correct destination. **Once a task starts migrating, its destination cannot be changed.**

Destination path formats:

| Type | Format | Example |
|------|--------|---------|
| SharePoint | `https://<tenant>.sharepoint.com/sites/<site>/<library>/<optional folder>` | `https://wilco.sharepoint.com/sites/Finance/Shared Documents/Archive` |
| OneDrive (UPN) | `name@domain` | `user@wilco.onmicrosoft.com` |
| OneDrive (URL) | `https://<tenant>-my.sharepoint.com/personal/<upn>/Documents/<optional folder>` | `https://wilco-my.sharepoint.com/personal/user_wilco_onmicrosoft_com/Documents` |
| Teams | select team + channel | — |

For bulk: **Upload destinations** → fill the CSV template's *Destination path* column → re-upload → **complete validation** (fix all failures before saving). Pre-provision OneDrive for any OneDrive destinations.

### Step 5 — Map identities
Map Dropbox **domains, groups, and users** to their Microsoft 365 equivalents. **Do this before any migration** — incorrect/incomplete mapping causes lost access and wrong attribution at the destination.

Permission role translation:

| Dropbox role | Result in OneDrive/SharePoint |
|--------------|-------------------------------|
| Owner | Owner |
| Editor | Can edit |
| Viewer | Can view |

For groups, recreate (or reuse) a Microsoft 365 group with matching membership and map the Dropbox group to it.

### Step 6 — Migrate and monitor
1. Select tasks → **Migrate** → confirm.
2. Monitor status + summary table. Full-team migrations run **hours to days**.
3. **Do not rename/move migrated files before the final pass completes** — doing so causes files to be overwritten.
4. Download **Migration summary** / **Migration detailed** reports; resolve warnings/failures and **re-migrate** affected tasks.

#### Delta sync (recommended cutover pattern)
- The first run is the **initial migration**; re-running a task is a **delta sync** (incremental).
- In delta sync, only changed/new files transfer, and **permissions update only when their file transfers**.
- **Wilco cutover plan:** run an initial migration well ahead of cutover, keep Dropbox as source of truth, then run a **final delta sync** during the cutover window, freeze Dropbox writes, validate, and redirect users to SharePoint/OneDrive.

---

## Wilco cutover checklist

- [ ] Confirm which "Dropbox connection" exists today (Migration Manager project vs. Copilot connector) — don't assume reuse.
- [ ] Dropbox team-admin account with Read access to all in-scope folders confirmed.
- [ ] M365 Migration Admin role assigned to the migration operator.
- [ ] Destination SharePoint sites / Teams created; OneDrive pre-provisioned for OneDrive targets.
- [ ] Storage quota verified against total Dropbox volume.
- [ ] Zero Trust config (DLP, labels, external sharing) deployed/validated for the Wilco tenant.
- [ ] Initial scan complete; oversized folders split (< 100k items / < 1 TB per task).
- [ ] Destinations reviewed and validated (CSV bulk where needed).
- [ ] Identity mapping completed and reviewed.
- [ ] "Does not migrate" list communicated to Wilco (version history, Paper, guest perms, etc.).
- [ ] Initial migration run; reports triaged; failures re-migrated.
- [ ] Cutover window scheduled; Dropbox writes frozen; final delta sync run.
- [ ] Post-migration validation (spot-check files, permissions, counts); guest re-sharing instructions sent to users.

---

## References (Microsoft Learn)

- [Migrate Dropbox to Microsoft 365 with Migration Manager (overview + get started)](https://learn.microsoft.com/sharepointmigration/mm-dropbox-overview)
- [Step 1: Connect to Dropbox](https://learn.microsoft.com/sharepointmigration/mm-dropbox-step1-connect)
- [Step 2: Scan and assess](https://learn.microsoft.com/sharepointmigration/mm-dropbox-step2-scan-assess)
- [Step 3: Copy to migrations](https://learn.microsoft.com/sharepointmigration/mm-dropbox-step3-copy-to-migrations)
- [Step 4: Review destination paths](https://learn.microsoft.com/sharepointmigration/mm-dropbox-step4-review-destinations)
- [Step 5: Map identities](https://learn.microsoft.com/sharepointmigration/mm-dropbox-step5-map-identities)
- [Step 6: Migrate and monitor](https://learn.microsoft.com/sharepointmigration/mm-dropbox-step6-migrate-monitor)
- [Permission settings in Migration Manager](https://learn.microsoft.com/sharepointmigration/mm-project-settings-permissions)
- [Delta sync behavior](https://learn.microsoft.com/sharepointmigration/mm-delta-sync)
- [Migration Admin role](https://learn.microsoft.com/sharepointmigration/mm-migration-admin-role)
- [Data migration: what migrates / what doesn't (FastTrack)](https://learn.microsoft.com/microsoft-365/fasttrack/data-migration#migration-to-sharepoint)
- [Dropbox Copilot connector (NOT migration — for contrast)](https://learn.microsoft.com/microsoft-365/copilot/connectors/dropbox-deployment)
