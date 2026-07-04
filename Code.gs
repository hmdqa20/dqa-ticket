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
  ROW_ID:           13,  // N
  RETEST_REF:       14,  // O — 복제 원본 ticket_id
  VERSION_ID:       15,  // P — 소속 버전 탭 ID
  LOCKED_AT:        16   // Q — 편집 잠금 시각 (JST ISO)
};

// ─── versions 시트 컬럼 인덱스 (0-based) ─────────────────────────────────────
const VCOL = {
  VERSION_ID:   0,  // A
  VERSION_NAME: 1,  // B
  STATUS:       2,  // C  진행중 / 완료
  CREATED_AT:   3,  // D
  SORT_ORDER:   4   // E
};

const ACTIVE_STATUSES = ['진행중', '진행전', '재테스트'];
const DONE_STATUS     = '완료';
const HOLD_STATUSES   = ['보류', 'N/A'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSheet() {
  const props = PropertiesService.getScriptProperties();
  const ssId  = props.getProperty('SPREADSHEET_ID');
  const ss    = ssId
    ? SpreadsheetApp.openById(ssId)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Spreadsheet not found. Set SPREADSHEET_ID in Script Properties.');
  const sheet = ss.getSheetByName('tickets');
  if (!sheet) throw new Error('Sheet "tickets" not found in the spreadsheet.');
  return sheet;
}

// versions 시트 반환 (없으면 헤더와 함께 자동 생성)
function getVersionSheet() {
  const props = PropertiesService.getScriptProperties();
  const ssId  = props.getProperty('SPREADSHEET_ID');
  const ss    = ssId
    ? SpreadsheetApp.openById(ssId)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Spreadsheet not found. Set SPREADSHEET_ID in Script Properties.');
  let sheet = ss.getSheetByName('versions');
  if (!sheet) {
    sheet = ss.insertSheet('versions');
    sheet.getRange(1, 1, 1, 5).setValues([['version_id', 'version_name', 'status', 'created_at', 'sort_order']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
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
    row_id:            String(row[COL.ROW_ID]            || ''),
    retest_ref:        String(row[COL.RETEST_REF]        || ''),
    version_id:        String(row[COL.VERSION_ID]        || ''),
    locked_at:         String(row[COL.LOCKED_AT]         || '')
  };
}

// versions 시트 행 → 객체
function versionRowToObj(row) {
  return {
    version_id:   String(row[VCOL.VERSION_ID]   || ''),
    version_name: String(row[VCOL.VERSION_NAME] || ''),
    status:       String(row[VCOL.STATUS]       || '진행중'),
    created_at:   String(row[VCOL.CREATED_AT]   || ''),
    sort_order:   Number(row[VCOL.SORT_ORDER])  || 0
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

    // versions 시트도 함께 반환 (API 호출 2회→1회 감소)
    const vSheet   = getVersionSheet();
    const vData    = vSheet.getDataRange().getValues();
    const versions = vData.length <= 1 ? [] :
      vData.slice(1).map(versionRowToObj).filter(v => v.version_id !== '').sort((a, b) => a.sort_order - b.sort_order);

    if (data.length <= 1) return jsonResponse({ success: true, data: empty, versions });

    // version_id 파라미터가 있으면 해당 버전 티켓만 (없으면 전체 — 하위 호환)
    const versionId = e && e.parameter ? e.parameter.version_id : '';
    let rows = data.slice(1).map(rowToObj).filter(r => r.row_id !== '');
    if (versionId) rows = rows.filter(r => r.version_id === versionId);

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

    return jsonResponse({ success: true, data: { activeWW, activeMVN, done, hold }, versions });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ─── doPost router ────────────────────────────────────────────────────────────

function doPost(e) {
  Logger.log('doPost called. type=%s, params=%s', e.parameter.type, JSON.stringify(e.parameter));
  const type = e.parameter.type;
  try {
    switch (type) {
      case 'addTicket':    return addTicket(e);
      case 'updateTicket': return updateTicket(e);
      case 'deleteTicket': return deleteTicket(e);
      case 'trashFiles':   return trashFiles(e);
      case 'getVersions':  return getVersions(e);
      case 'addVersion':   return addVersion(e);
      case 'updateVersion':return updateVersion(e);
      case 'deleteVersion':return deleteVersion(e);
      case 'moveTicket':   return moveTicket(e);
      case 'fetchJira':    return fetchJira(e);
      case 'uploadFile':   return uploadFile(e);
      case 'lockTicket':   return lockTicket(e);
      case 'unlockTicket': return unlockTicket(e);
      case 'checkLock':    return checkLock(e);
      default: return jsonResponse({ success: false, error: 'Unknown type: ' + type });
    }
  } catch (err) {
    Logger.log('doPost error: %s\n%s', err.message, err.stack);
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
      rowId,
      p.retest_ref    || '',
      p.version_id    || ''
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
      rowId,
      pick('retest_ref',    COL.RETEST_REF) || '',
      pick('version_id',    COL.VERSION_ID) || ''
    ];

    sheet.getRange(sheetRow, 1, 1, updatedRow.length).setValues([updatedRow]);

    return jsonResponse({ success: true });

  } finally {
    lock.releaseLock();
  }
}

// ─── deleteTicket ─────────────────────────────────────────────────────────────

function deleteTicket(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet  = getSheet();
    const data   = sheet.getDataRange().getValues();
    const rowId  = e.parameter.row_id;

    if (!rowId) return jsonResponse({ success: false, error: 'row_id is required' });

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][COL.ROW_ID]) === rowId) {
        const assignee  = String(data[i][COL.ASSIGNEE]   || '');
        const status    = String(data[i][COL.STATUS]     || '');
        const fileUrls  = String(data[i][COL.FILE_URLS]  || '');
        const versionId = String(data[i][COL.VERSION_ID] || '');

        sheet.deleteRow(i + 1);

        // Drive 첨부 파일 휴지통으로 이동
        if (fileUrls) {
          fileUrls.split(',').forEach(url => {
            const m = url.trim().match(/\/d\/([^\/]+)\//);
            if (m) {
              try { DriveApp.getFileById(m[1]).setTrashed(true); }
              catch (err) { Logger.log('Drive file trash failed: %s', err.message); }
            }
          });
        }

        return jsonResponse({ success: true });
      }
    }
    return jsonResponse({ success: false, error: 'Ticket not found: ' + rowId });
  } finally {
    lock.releaseLock();
  }
}

// ─── trashFiles ───────────────────────────────────────────────────────────────

function trashFiles(e) {
  const fileUrls = e.parameter.file_urls || '';
  if (!fileUrls) return jsonResponse({ success: true });
  fileUrls.split(',').forEach(url => {
    const m = url.trim().match(/\/d\/([^\/]+)\//);
    if (m) {
      try { DriveApp.getFileById(m[1]).setTrashed(true); }
      catch (err) { Logger.log('trashFiles: %s', err.message); }
    }
  });
  return jsonResponse({ success: true });
}

// ─── getVersions ───────────────────────────────────────────────────────────────

function getVersions(e) {
  const sheet = getVersionSheet();
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return jsonResponse({ success: true, versions: [] });

  const versions = data.slice(1)
    .map(versionRowToObj)
    .filter(v => v.version_id !== '')
    .sort((a, b) => a.sort_order - b.sort_order);

  return jsonResponse({ success: true, versions: versions });
}

// ─── addVersion ────────────────────────────────────────────────────────────────

function addVersion(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getVersionSheet();
    const p     = e.parameter;
    const name  = (p.version_name || '').trim();
    if (!name) return jsonResponse({ success: false, error: 'version_name is required' });

    const data      = sheet.getDataRange().getValues();
    const versionId = Utilities.getUuid();
    const now       = getJSTISOString();
    const status    = p.status || '진행중';

    // 현재 마지막 sort_order + 1
    let maxOrder = 0;
    for (let i = 1; i < data.length; i++) {
      const o = Number(data[i][VCOL.SORT_ORDER]) || 0;
      if (o > maxOrder) maxOrder = o;
    }

    sheet.appendRow([versionId, name, status, now, maxOrder + 1]);
    return jsonResponse({ success: true, version_id: versionId });

  } finally {
    lock.releaseLock();
  }
}

// ─── updateVersion ─────────────────────────────────────────────────────────────
// version_name, sort_order, status 중 전달된 필드만 수정

function updateVersion(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet     = getVersionSheet();
    const data      = sheet.getDataRange().getValues();
    const p         = e.parameter;
    const versionId = p.version_id;

    if (!versionId) return jsonResponse({ success: false, error: 'version_id is required' });

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][VCOL.VERSION_ID]) === versionId) {
        const sheetRow = i + 1;
        if (p.version_name !== undefined) {
          sheet.getRange(sheetRow, VCOL.VERSION_NAME + 1).setValue(p.version_name);
        }
        if (p.sort_order !== undefined) {
          sheet.getRange(sheetRow, VCOL.SORT_ORDER + 1).setValue(Number(p.sort_order));
        }
        if (p.status !== undefined) {
          sheet.getRange(sheetRow, VCOL.STATUS + 1).setValue(p.status);
        }
        return jsonResponse({ success: true });
      }
    }
    return jsonResponse({ success: false, error: 'Version not found: ' + versionId });
  } finally {
    lock.releaseLock();
  }
}

// ─── deleteVersion ─────────────────────────────────────────────────────────────
// versions 시트에서 해당 행 삭제. 소속 티켓의 version_id는 빈칸으로 초기화.

function deleteVersion(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const versionId = e.parameter.version_id;
    if (!versionId) return jsonResponse({ success: false, error: 'version_id is required' });

    // versions 시트에서 해당 행 삭제
    const vSheet = getVersionSheet();
    const vData  = vSheet.getDataRange().getValues();
    for (let i = 1; i < vData.length; i++) {
      if (String(vData[i][VCOL.VERSION_ID]) === versionId) {
        vSheet.deleteRow(i + 1);
        break;
      }
    }

    // tickets 시트에서 해당 version_id 빈칸으로 초기화
    const tSheet = getSheet();
    const tData  = tSheet.getDataRange().getValues();
    for (let i = 1; i < tData.length; i++) {
      if (String(tData[i][COL.VERSION_ID]) === versionId) {
        tSheet.getRange(i + 1, COL.VERSION_ID + 1).setValue('');
      }
    }

    return jsonResponse({ success: true });
  } finally {
    lock.releaseLock();
  }
}

// ─── moveTicket ────────────────────────────────────────────────────────────────
// 티켓을 다른 버전으로 이동. 활성 티켓이면 priority 초기화 (새 버전에서 사용자가 직접 지정).

function moveTicket(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet    = getSheet();
    const data     = sheet.getDataRange().getValues();
    const rowId    = e.parameter.row_id;
    const targetId = e.parameter.target_version_id || '';

    if (!rowId) return jsonResponse({ success: false, error: 'row_id is required' });

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][COL.ROW_ID]) === rowId) {
        const assignee  = String(data[i][COL.ASSIGNEE]   || '');
        const status    = String(data[i][COL.STATUS]     || '');
        const oldVerId  = String(data[i][COL.VERSION_ID] || '');
        const sheetRow  = i + 1;

        if (oldVerId === targetId) return jsonResponse({ success: true }); // 변경 없음

        // 버전 변경. 활성 티켓이면 priority 초기화 (새 버전에서 사용자가 직접 지정).
        sheet.getRange(sheetRow, COL.VERSION_ID + 1).setValue(targetId);
        if (ACTIVE_STATUSES.includes(status)) {
          sheet.getRange(sheetRow, COL.PRIORITY + 1).setValue('');
        }

        return jsonResponse({ success: true });
      }
    }
    return jsonResponse({ success: false, error: 'Ticket not found: ' + rowId });
  } finally {
    lock.releaseLock();
  }
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

// ─── lockTicket ───────────────────────────────────────────────────────────────
// 이미 30분 이내 잠긴 경우 { success: true, locked: true }
// 잠금 성공 시            { success: true, locked: false }

function lockTicket(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet();
    const data  = sheet.getDataRange().getValues();
    const rowId = e.parameter.row_id;
    if (!rowId) return jsonResponse({ success: false, error: 'row_id is required' });

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][COL.ROW_ID]) === rowId) {
        const sheetRow = i + 1;
        const lockedAt = String(data[i][COL.LOCKED_AT] || '');

        if (lockedAt) {
          const elapsed = new Date() - new Date(lockedAt);
          if (elapsed < 30 * 60 * 1000) {
            return jsonResponse({ success: true, locked: true });
          }
        }

        sheet.getRange(sheetRow, COL.LOCKED_AT + 1).setValue(getJSTISOString());
        SpreadsheetApp.flush();
        return jsonResponse({ success: true, locked: false });
      }
    }
    return jsonResponse({ success: false, error: 'Ticket not found: ' + rowId });
  } finally {
    lock.releaseLock();
  }
}

// ─── unlockTicket ─────────────────────────────────────────────────────────────

function unlockTicket(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet();
    const data  = sheet.getDataRange().getValues();
    const rowId = e.parameter.row_id;
    if (!rowId) return jsonResponse({ success: false, error: 'row_id is required' });

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][COL.ROW_ID]) === rowId) {
        sheet.getRange(i + 1, COL.LOCKED_AT + 1).setValue('');
        SpreadsheetApp.flush();
        return jsonResponse({ success: true });
      }
    }
    return jsonResponse({ success: false, error: 'Ticket not found: ' + rowId });
  } finally {
    lock.releaseLock();
  }
}

// ─── checkLock ────────────────────────────────────────────────────────────────

function checkLock(e) {
  try {
    const sheet = getSheet();
    const data  = sheet.getDataRange().getValues();
    const rowId = e.parameter.row_id;
    if (!rowId) return jsonResponse({ success: false, error: 'row_id is required' });

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][COL.ROW_ID]) === rowId) {
        const lockedAt = String(data[i][COL.LOCKED_AT] || '');
        if (!lockedAt) return jsonResponse({ success: true, locked: false });
        const elapsed = new Date() - new Date(lockedAt);
        return jsonResponse({ success: true, locked: elapsed < 30 * 60 * 1000 });
      }
    }
    return jsonResponse({ success: false, error: 'Ticket not found: ' + rowId });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
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
    'file_urls', 'row_id', 'retest_ref', 'version_id'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);

  // versions 시트도 함께 생성
  setupVersionHeaders();
}

// ─── versions 시트 헤더 생성 (수동 1회 실행) ──────────────────────────────────

function setupVersionHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('versions');
  if (!sheet) sheet = ss.insertSheet('versions');

  const headers = ['version_id', 'version_name', 'status', 'created_at', 'sort_order'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}
