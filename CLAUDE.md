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
| M | file_urls | comma-separated entries, each `name|size|url` (legacy: bare url) |
| N | row_id | UUID, auto-generated on creation |
| O | retest_ref | original ticket_id for cloned/retest tickets |
| P | version_id | owning version tab (UUID from `versions` sheet) |

## Sheets Schema — `versions`
| Col | Field | Notes |
|-----|-------|-------|
| A | version_id | UUID, auto-generated |
| B | version_name | e.g. V09.02.20 |
| C | status | 진행중 / 완료 |
| D | created_at | ISO datetime JST, auto-set |
| E | sort_order | display order (number) |

Priority (실시순서) is managed **per version**: `renumberActiveGroup(sheet, assignee, versionId)` scopes renumbering to one version's WW/MVN group. `doGet?version_id=…` returns only that version's tickets (no param = all, for backward compat). Frontend has an "전체"(All) pseudo-tab plus one tab per version; selection persisted in `localStorage['dqa_current_version']`.

## One-time Setup
1. Paste `Code.gs` into GAS editor
2. Run `setupInitialHeaders()` once to create the `tickets` sheet (also creates `versions`)
3. For an existing sheet, run `setupVersionHeaders()` once to add the `versions` sheet, and add `retest_ref` (O) / `version_id` (P) headers to `tickets`
4. Set all Script Properties listed above
5. Deploy as Web App: Execute as Me / Anyone can access
6. Copy the Web App URL for use in the frontend

## Modification Log (newest first)
| Date | Change |
|------|--------|
| 2026-06-27 | detail.html/js/css: 3단 그리드 레이아웃 (확인버전 \| 진행정보 \| 버전이동); ticket-form 1fr 1fr 1fr; form-section/form-section-title/version-move-info 스타일; i18n label_progress_info 추가 |
| 2026-06-27 | detail.js: 버전이동 label 항상 현재 버전명 표시(없으면 "미지정"); 신규 등록 시 sort_order 최소 버전 자동 선택 |
| 2026-06-27 | detail.html: form-left-col wrapper aligns 확인버전+버전이동 in col-1; 버전이동 label shows current version name (label-sub); i18n label_version_move updated |
| 2026-06-27 | Sidebar folder-tab redesign: #F0F2F5 bg, active tab white+blue left border, dot #3B6D11, --surface-2/--fill-accent/--sidebar-bg vars |
| 2026-06-27 | Version management page: versions.html + js/versions.js; GAS updateVersion/deleteVersion; index.html gear button (⚙); css/style.css ver-* styles, .btn-icon |
| 2026-06-27 | Version tabs: `versions` sheet + `version_id` col (P); GAS getVersions/addVersion/moveTicket, version-scoped priority renumbering, doGet version filter; left sidebar version tabs, ticket move menu, detail `?version_id=` param |
| 2026-06-26 | Frontend: index.html, detail.html, css/style.css, js/api.js, js/i18n.js, js/index.js, js/detail.js — 4-group ticket list, detail/edit form, drag-drop file upload, i18n (ko/jp/en/vi) |
| 2026-06-26 | Initial Code.gs: doGet, addTicket, updateTicket, fetchJira, uploadFile; JIRA Server Basic Auth (JIRA_PASSWORD); created_date auto-set on creation |


## gas url
https://script.google.com/macros/s/AKfycbzzUsXwJ4oOrX63HmSyScYRtzCnpUD5shGTRwwxfwg1KX_UfVdpoflcex6vvdvnlrZc0A/exec