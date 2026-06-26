# DQA Ticket Manager

Ticket management web app for multi-country DQA workflows.

## Stack
- **Backend**: Google Apps Script (GAS) web app — `Code.gs`
- **Database**: Google Sheets, sheet name: `tickets`
- **Frontend**: GitHub Pages (static HTML/CSS/JS)

## GAS Rules
- **Redeploy required** after every `.gs` change: Deploy → Manage deployments → New version
- All datetime in **JST (UTC+9)**: `new Date(new Date().getTime() + 9*60*60*1000)`
- Credentials stored in **PropertiesService.getScriptProperties()**
- doPost routing uses field name **`type`** (not `action`)
- All responses: `ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON)`
- All write operations wrapped in `LockService.getScriptLock()`

## Script Properties (set in GAS editor)
| Key | Description |
|-----|-------------|
| `JIRA_BASE_URL` | e.g. `http://jira.company.com` |
| `JIRA_EMAIL` | JIRA login ID or email |
| `JIRA_PASSWORD` | JIRA login password (Server/DC — Basic Auth) |
| `DRIVE_FOLDER_ID` | Google Drive folder ID for uploaded files |

## Sheets Schema — `tickets`
| Col | Field | Notes |
|-----|-------|-------|
| A | ticket_id | e.g. XAX2-2667 |
| B | created_date | ISO date, auto-set (JST) on creation |
| C | title | JIRA issue summary, manually entered |
| D | check_version | |
| E | assignee | 박수원 / 홍경두 / MVN |
| F | priority | 1/2/3, active tickets only, empty otherwise |
| G | status | 진행중 / 진행전 / 완료 / 보류 / N/A |
| H | verdict | OK / NG / empty |
| I | check_content | |
| J | note | |
| K | wjira_updated | "OK" or empty |
| L | status_changed_at | ISO datetime JST, auto-set on status change |
| M | file_urls | comma-separated Google Drive URLs |
| N | row_id | UUID, auto-generated on creation |

## One-time Setup
1. Paste `Code.gs` into GAS editor
2. Run `setupInitialHeaders()` once to create the `tickets` sheet with headers
3. Set all Script Properties listed above
4. Deploy as Web App: Execute as Me / Anyone can access
5. Copy the Web App URL for use in the frontend

## Modification Log (newest first)
| Date | Change |
|------|--------|
| 2026-06-26 | Frontend: index.html, detail.html, css/style.css, js/api.js, js/i18n.js, js/index.js, js/detail.js — 4-group ticket list, detail/edit form, drag-drop file upload, i18n (ko/jp/en/vi) |
| 2026-06-26 | Initial Code.gs: doGet, addTicket, updateTicket, fetchJira, uploadFile; JIRA Server Basic Auth (JIRA_PASSWORD); created_date auto-set on creation |


## gas url
https://script.google.com/macros/s/AKfycbzl3UgVMiLvHaUgBXCmL0xF61xAfN1Ua5r000HJzlK9cXs7L0270JBMrf_D8RbKifwfJQ/exec