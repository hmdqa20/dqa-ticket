// ─── Column indices (0-based for array access) ───────────────────────────────
const COL = {
  TICKET_ID:         0,  // A
  CREATED_DATE:      1,  // B
  TITLE:             2,  // C
  CHECK_VERSION:     3,  // D
  ASSIGNEE:          4,  // E
  PRIORITY:          5,  // F
  STATUS:            6,  // G
  VERDICT:           7,  // H
  CHECK_CONTENT:     8,  // I
  NOTE:              9,  // J
  WJIRA_UPDATED:    10,  // K
  STATUS_CHANGED_AT:11,  // L
  FILE_URLS:        12,  // M
  ROW_ID:           13   // N
};

const ACTIVE_STATUSES = ['진행중', '진행전'];
const DONE_STATUS     = '완료';
const HOLD_STATUSES   = ['보류', 'N/A'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('tickets');
}

function getJSTISOString() {
  const jst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().replace('Z', '+09:00');
}

function getJSTDateString() {
  const jst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().substring(0, 10);
}

function rowToObj(row) {
  return {
    ticket_id:         String(row[COL.TICKET_ID]         || ''),
    created_date:      String(row[COL.CREATED_DATE]      || ''),
    title:             String(row[COL.TITLE]             || ''),
    check_version:     String(row[COL.CHECK_VERSION]     || ''),
    assignee:          String(row[COL.ASSIGNEE]          || ''),
    priority:          row[COL.PRIORITY] === '' ? '' : (Number(row[COL.PRIORITY]) || ''),
    status:            String(row[COL.STATUS]            || ''),
    verdict:           String(row[COL.VERDICT]           || ''),
    check_content:     String(row[COL.CHECK_CONTENT]     || ''),
    note:              String(row[COL.NOTE]              || ''),
    wjira_updated:     String(row[COL.WJIRA_UPDATED]     || ''),
    status_changed_at: String(row[COL.STATUS_CHANGED_AT] || ''),
    file_urls:         String(row[COL.FILE_URLS]         || ''),
    row_id:            String(row[COL.ROW_ID]            || '')
  };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── doGet ────────────────────────────────────────────────────────────────────

function doGet(e) {
  try {
    const sheet = getSheet();
    const data  = sheet.getDataRange().getValues();
    const empty = { activeWW: [], activeMVN: [], done: [], hold: [] };

    if (data.length <= 1) return jsonResponse({ success: true, data: empty });

    const rows = data.slice(1).map(rowToObj).filter(r => r.row_id !== '');

    const activeWW  = [];
    const activeMVN = [];
    const done      = [];
    const hold      = [];

    rows.forEach(r => {
      if (ACTIVE_STATUSES.includes(r.status)) {
        (r.assignee === 'MVN' ? activeMVN : activeWW).push(r);
      } else if (r.status === DONE_STATUS) {
        done.push(r);
      } else if (HOLD_STATUSES.includes(r.status)) {
        hold.push(r);
      }
    });

    const byPriority = (a, b) =>
      (a.priority === '' ? 999 : Number(a.priority)) -
      (b.priority === '' ? 999 : Number(b.priority));

    const byChangedDesc = (a, b) =>
      new Date(b.status_changed_at) - new Date(a.status_changed_at);

    activeWW.sort(byPriority);
    activeMVN.sort(byPriority);
    done.sort(byChangedDesc);
    hold.sort(byChangedDesc);

    return jsonResponse({ success: true, data: { activeWW, activeMVN, done, hold } });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ─── doPost router ────────────────────────────────────────────────────────────

function doPost(e) {
  const type = e.parameter.type;
  try {
    switch (type) {
      case 'addTicket':    return addTicket(e);
      case 'updateTicket': return updateTicket(e);
      case 'fetchJira':    return fetchJira(e);
      case 'uploadFile':   return uploadFile(e);
      default: return jsonResponse({ success: false, error: 'Unknown type: ' + type });
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ─── addTicket ────────────────────────────────────────────────────────────────

function addTicket(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet    = getSheet();
    const p        = e.parameter;
    const rowId    = Utilities.getUuid();
    const now      = getJSTISOString();
    const today    = getJSTDateString();
    const status   = p.status || '진행전';
    const isActive = ACTIVE_STATUSES.includes(status);

    const newRow = [
      p.ticket_id     || '',
      today,                                      // created_date: auto-set in JST
      p.title         || '',
      p.check_version || '',
      p.assignee      || '',
      isActive ? (p.priority || '') : '',         // priority only for active tickets
      status,
      p.verdict       || '',
      p.check_content || '',
      p.note          || '',
      p.wjira_updated || '',
      now,                                        // status_changed_at: auto-set in JST
      p.file_urls     || '',
      rowId
    ];

    sheet.appendRow(newRow);
    return jsonResponse({ success: true, row_id: rowId });

  } finally {
    lock.releaseLock();
  }
}

// ─── updateTicket ─────────────────────────────────────────────────────────────

function updateTicket(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet  = getSheet();
    const data   = sheet.getDataRange().getValues();
    const p      = e.parameter;
    const rowId  = p.row_id;

    if (!rowId) return jsonResponse({ success: false, error: 'row_id is required' });

    // data[0] = header = sheet row 1; data[i] = sheet row i+1
    let sheetRow = -1;
    let dataIdx  = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][COL.ROW_ID]) === rowId) {
        sheetRow = i + 1;
        dataIdx  = i;
        break;
      }
    }

    if (sheetRow === -1) {
      return jsonResponse({ success: false, error: 'Ticket not found: ' + rowId });
    }

    const old      = data[dataIdx];
    const oldStatus = String(old[COL.STATUS] || '');
    const newStatus = p.status !== undefined ? p.status : oldStatus;
    const statusChanged     = oldStatus !== newStatus;
    const wasActive         = ACTIVE_STATUSES.includes(oldStatus);
    const isNowActive       = ACTIVE_STATUSES.includes(newStatus);
    const movingToInactive  = wasActive && !isNowActive;

    const pick = (key, colIdx) =>
      p[key] !== undefined ? p[key] : old[colIdx];

    const updatedRow = [
      pick('ticket_id',     COL.TICKET_ID),
      pick('created_date',  COL.CREATED_DATE),
      pick('title',         COL.TITLE),
      pick('check_version', COL.CHECK_VERSION),
      pick('assignee',      COL.ASSIGNEE),
      movingToInactive ? '' : pick('priority', COL.PRIORITY),
      newStatus,
      pick('verdict',       COL.VERDICT),
      pick('check_content', COL.CHECK_CONTENT),
      pick('note',          COL.NOTE),
      pick('wjira_updated', COL.WJIRA_UPDATED),
      statusChanged ? getJSTISOString() : old[COL.STATUS_CHANGED_AT],
      pick('file_urls',     COL.FILE_URLS),
      rowId
    ];

    sheet.getRange(sheetRow, 1, 1, updatedRow.length).setValues([updatedRow]);

    if (movingToInactive) {
      renumberActiveGroup(sheet, String(old[COL.ASSIGNEE] || ''));
    }

    return jsonResponse({ success: true });

  } finally {
    lock.releaseLock();
  }
}

// Re-number all active tickets in the same group (WW or MVN) from 1,
// preserving relative order by current priority.
function renumberActiveGroup(sheet, assignee) {
  const data   = sheet.getDataRange().getValues();
  const isMVN  = assignee === 'MVN';
  const active = [];

  for (let i = 1; i < data.length; i++) {
    const row         = data[i];
    const rowStatus   = String(row[COL.STATUS]   || '');
    const rowAssignee = String(row[COL.ASSIGNEE] || '');
    const sameGroup   = isMVN ? rowAssignee === 'MVN' : rowAssignee !== 'MVN';

    if (ACTIVE_STATUSES.includes(rowStatus) && sameGroup) {
      active.push({ sheetRow: i + 1, priority: Number(row[COL.PRIORITY]) || 999 });
    }
  }

  active.sort((a, b) => a.priority - b.priority);
  active.forEach((item, idx) => {
    sheet.getRange(item.sheetRow, COL.PRIORITY + 1).setValue(idx + 1);
  });
}

// ─── fetchJira ────────────────────────────────────────────────────────────────

function fetchJira(e) {
  const props    = PropertiesService.getScriptProperties();
  const baseUrl  = props.getProperty('JIRA_BASE_URL');
  const email    = props.getProperty('JIRA_EMAIL');
  const password = props.getProperty('JIRA_PASSWORD');

  if (!baseUrl || !email || !password) {
    return jsonResponse({
      success: false,
      error: 'JIRA credentials not configured (JIRA_BASE_URL, JIRA_EMAIL, JIRA_PASSWORD)'
    });
  }

  const ticketId = e.parameter.ticketId;
  if (!ticketId) return jsonResponse({ success: false, error: 'ticketId is required' });

  const url = baseUrl.replace(/\/$/, '') + '/rest/api/2/issue/' + ticketId + '?fields=summary';
  const res = UrlFetchApp.fetch(url, {
    method: 'GET',
    headers: {
      Authorization: 'Basic ' + Utilities.base64Encode(email + ':' + password),
      Accept: 'application/json'
    },
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  if (code !== 200) {
    return jsonResponse({ success: false, error: 'JIRA API returned ' + code + ': ' + res.getContentText() });
  }

  const json = JSON.parse(res.getContentText());
  return jsonResponse({ success: true, title: json.fields.summary || '' });
}

// ─── uploadFile ───────────────────────────────────────────────────────────────

function uploadFile(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const props    = PropertiesService.getScriptProperties();
    const folderId = props.getProperty('DRIVE_FOLDER_ID');

    if (!folderId) {
      return jsonResponse({ success: false, error: 'DRIVE_FOLDER_ID not configured in Script Properties' });
    }

    const p          = e.parameter;
    const base64Data = p.base64Data;
    if (!base64Data) return jsonResponse({ success: false, error: 'base64Data is required' });

    const fileName = p.fileName || ('upload_' + new Date().getTime());
    const mimeType = p.mimeType || 'application/octet-stream';

    const folder = DriveApp.getFolderById(folderId);
    const blob   = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
    const file   = folder.createFile(blob);

    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return jsonResponse({
      success:  true,
      fileUrl:  'https://drive.google.com/file/d/' + file.getId() + '/view',
      fileName: fileName
    });

  } finally {
    lock.releaseLock();
  }
}

// ─── One-time setup (run manually from GAS editor) ────────────────────────────

function setupInitialHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('tickets');
  if (!sheet) sheet = ss.insertSheet('tickets');

  const headers = [
    'ticket_id', 'created_date', 'title', 'check_version',
    'assignee', 'priority', 'status', 'verdict',
    'check_content', 'note', 'wjira_updated', 'status_changed_at',
    'file_urls', 'row_id'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}
