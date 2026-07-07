function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// 원문에 일본어 문자가 있는지 판정 (Code.gs의 JP_RUN_RE와 동일 문자 범위, 존재 여부만 확인)
const JP_CHAR_RE = /[぀-ゟ゠-ヿ一-龯　-〿㐀-䶿豈-﫿]/;

let isNewMode = false;
let currentTicket = null;
let uploadedFiles = [];    // 이미 Drive에 저장된 {name, size, url} 목록
let pendingFiles = [];     // 아직 업로드 안 된 File 객체 목록 (저장 시 업로드)
let removedFileUrls = [];  // 삭제 예정 Drive 파일 URL (저장 시 Drive에서 제거)
let cachedAllTickets = null;
let isDirty = false;
let currentVersionId = '';  // 신규 등록 시 소속 버전 (URL 파라미터)
let allVersions = [];       // 전체 버전 목록 (드롭다운용)
let currentRowId = '';      // 편집 중인 티켓 row_id (잠금 관리용)
let heartbeatTimer = null;  // 편집 잠금 heartbeat interval id
const HEARTBEAT_MS = 2 * 60 * 1000;  // 2분 주기 (5분 타임아웃의 절반 이하 — 1회 유실돼도 다음 신호가 만료 전 도착)

function markDirty() { isDirty = true; }
function resetDirty() { isDirty = false; }

// 편집 중 잠금 유지: 주기적으로 서버 LOCKED_AT 갱신. 실패는 조용히 무시(재시도 없음 — 2분 뒤 재시도됨).
function startHeartbeat(rowId) {
  stopHeartbeat();  // 중복 시작 방지
  heartbeatTimer = setInterval(() => {
    heartbeat(rowId).catch(err => console.warn('heartbeat 실패(무시):', err && err.message));
  }, HEARTBEAT_MS);
}
// interval 정리 — 이미 떠난 세션이 잠금을 계속 갱신하지 않도록 모든 이탈 경로에서 호출.
function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

function getPrefix() {
  const sel = document.getElementById('ticket-prefix');
  return sel ? sel.value : 'XAX2-';
}

function confirmLeave() {
  if (!isDirty && pendingFiles.length === 0) return true;
  return confirm(t('confirm_leave'));
}

// beforeunload 시 잠금 해제 (sendBeacon = 페이지 언로드 중에도 전송 보장)
function handleLockBeforeUnload() {
  stopHeartbeat();
  if (currentRowId) {
    navigator.sendBeacon(GAS_URL, new URLSearchParams({ type: 'unlockTicket', row_id: currentRowId }));
  }
}

// 잠금 해제를 fire-and-forget(sendBeacon)로 처리 — 응답을 기다리지 않아 이동이 즉시 일어남
function releaseLockNow() {
  stopHeartbeat();
  if (!currentRowId) return;
  window.removeEventListener('beforeunload', handleLockBeforeUnload);
  navigator.sendBeacon(GAS_URL, new URLSearchParams({ type: 'unlockTicket', row_id: currentRowId }));
  // 목록에 "방금 내가 해제한 항목" 힌트 전달 → 서버 반영 전까지 자기 자물쇠 억제
  sessionStorage.setItem('dqa_released_row', currentRowId);
  currentRowId = '';
}

document.addEventListener('DOMContentLoaded', async () => {
  applyTranslations();

  // 언어 전환 시 UI 텍스트 + 번역 힌트만 갱신 — 잠금(lock) 로직 일체 건드리지 않음
  onLangChange(() => {
    applyTranslations();
    if (currentTicket) updateTitleTranslationHint(currentTicket);
    const vsel = document.getElementById('version-move-select');
    if (vsel) {
      if (vsel.disabled && vsel.options[0]) {
        vsel.options[0].textContent = `(${t('label_no_versions')})`;
      } else if (vsel.options[0] && vsel.options[0].value === '') {
        vsel.options[0].textContent = `(${t('label_unassigned')})`;
      }
      updateCurrentVersionLabel(vsel.value);
    }
  });

  const params = new URLSearchParams(location.search);
  const rowId = params.get('id');
  currentVersionId = params.get('version_id') || '';

  if (rowId) {
    isNewMode = false;
    await loadTicket(rowId);
  } else {
    isNewMode = true;
    await initNewMode();
  }

  setupStatusListener();
  setupFileUpload();
  setupLinkListeners();

  document.querySelectorAll('.version-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const pos = inp.selectionStart;
      inp.value = inp.value.toUpperCase();
      inp.setSelectionRange(pos, pos);
    });
  });

  const titleInput   = document.getElementById('title-input');
  const clearTitleBtn = document.getElementById('btn-clear-title');
  titleInput.addEventListener('input', () => {
    clearTitleBtn.style.display = titleInput.value ? '' : 'none';
  });
  clearTitleBtn.addEventListener('click', () => {
    titleInput.value = '';
    clearTitleBtn.style.display = 'none';
    titleInput.focus();
  });

  // 저장 후 목록으로 / 저장 후 계속 등록
  document.getElementById('btn-save-top').addEventListener('click',      () => handleSave(false));
  document.getElementById('btn-save-continue').addEventListener('click', () => handleSave(true));
  const navigateToList = () => {
    resetDirty();
    pendingFiles = [];
    releaseLockNow();           // 잠금 해제를 기다리지 않고 즉시 이동
    location.href = 'index.html';
  };
  document.getElementById('btn-cancel-top').addEventListener('click', () => { if (confirmLeave()) navigateToList(); });
  document.getElementById('btn-back').addEventListener('click',       () => { if (confirmLeave()) navigateToList(); });
  document.getElementById('btn-delete').addEventListener('click', handleDelete);

  // 폼 변경 감지
  document.getElementById('ticket-form').addEventListener('input',  markDirty);
  document.getElementById('ticket-form').addEventListener('change', markDirty);

  // Enter 키 → 다음 입력란으로 포커스 이동 (textarea 제외)
  document.getElementById('ticket-form').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.tagName.toLowerCase() === 'textarea') return;
    if (e.target.tagName.toLowerCase() === 'button') return;
    e.preventDefault();
    const focusable = Array.from(document.querySelectorAll(
      '#ticket-form input:not([type=hidden]):not([type=file]):not([type=checkbox]), #ticket-form select'
    )).filter(el => !el.disabled && el.offsetParent !== null);
    const idx = focusable.indexOf(e.target);
    if (idx >= 0 && idx < focusable.length - 1) focusable[idx + 1].focus();
  });
});

// ─── 신규 모드 ────────────────────────────────────────────────────────────────

async function initNewMode() {
  document.getElementById('page-title').textContent = t('page_title_new');
  document.getElementById('ticket-id-edit-wrap').style.display = '';
  document.getElementById('ticket-id-static').style.display = 'none';
  document.getElementById('created-date').textContent = formatDate(new Date());
  // 신규 모드에서만 "저장 후 계속 등록" 버튼 표시
  document.getElementById('btn-save-continue').style.display = '';

  // 신규 모드에서도 활성 티켓 수 기반으로 옵션 생성, 버전 목록도 함께 로드
  try {
    cachedAllTickets = await getTickets();
    allVersions = cachedAllTickets.versions || [];
  } catch (_) {}
  renderVersionSelect(currentVersionId);
  // 담당자 선택 시 같은 그룹+버전 기준으로 실시순서 재계산 (Rule 1)
  const assigneeEl = document.getElementById('assignee');
  const refreshPrioritySuggestion = () => {
    populatePriorityOptions(getSuggestedPriority(assigneeEl.value, currentVersionId));
  };
  refreshPrioritySuggestion();
  assigneeEl.addEventListener('change', refreshPrioritySuggestion);
  // 데이터 로드 완료 후 로딩 오버레이 제거
  document.getElementById('detail-loading').style.display = 'none';

  // 바로가기 버튼: 신규 모드에서 항상 표시, 번호 입력에 따라 href만 업데이트
  const linkBtn = document.getElementById('btn-wjira-link');
  const numInput = document.getElementById('ticket-id-num');
  linkBtn.style.display = '';
  const updateLinkBtn = () => {
    const num = numInput.value.trim();
    linkBtn.href = num
      ? 'https://wjira.humaxdigital.com/browse/' + getPrefix() + num
      : '#';
  };
  numInput.addEventListener('input', updateLinkBtn);
  updateLinkBtn();
  linkBtn.addEventListener('click', (e) => {
    if (!numInput.value.trim()) {
      e.preventDefault();
      showToast('티켓 번호를 입력해 주세요.');
    }
  });

  // btn-fetch는 숨겨두되 함수는 유지
  document.getElementById('btn-fetch').addEventListener('click', async () => {
    const numPart = document.getElementById('ticket-id-num').value.trim();
    if (!numPart) return;
    const ticketId = getPrefix() + numPart;
    const btn = document.getElementById('btn-fetch');
    btn.disabled = true;
    btn.textContent = '...';
    try {
      const result = await fetchJira(ticketId);
      document.getElementById('title-input').value = result.title;
    } catch (err) {
      alert(t('error_jira_fetch') + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = t('btn_fetch');
    }
  });
}

// ─── 수정 모드 ────────────────────────────────────────────────────────────────

async function loadTicket(rowId) {
  document.getElementById('page-title').textContent = t('page_title_edit');
  document.getElementById('detail-loading').style.display = 'flex';

  // 잠금 시도와 티켓 조회를 동시에 시작 (왕복 1회 시간 절약)
  const lockPromise = lockTicket(rowId).catch(() => null); // 잠금 API 오류 시 null
  const dataPromise = getTickets();

  // 잠금 결과 먼저 확인 — 다른 세션이 편집 중이면 팝업 후 목록으로 (데이터는 버림)
  const lockResult = await lockPromise;
  if (lockResult && lockResult.locked) {
    alert(t('error_ticket_locked'));
    location.href = 'index.html';
    return;
  }
  if (lockResult) {
    // 잠금 획득 성공 — 이탈 시 해제하도록 등록 + 편집 중 잠금 유지 heartbeat 시작
    currentRowId = rowId;
    window.addEventListener('beforeunload', handleLockBeforeUnload);
    startHeartbeat(rowId);
  }

  try {
    cachedAllTickets = await dataPromise;
    allVersions = cachedAllTickets.versions || [];
    const all = [...cachedAllTickets.activeWW, ...cachedAllTickets.activeMVN, ...cachedAllTickets.done, ...cachedAllTickets.hold];
    currentTicket = all.find(tk => tk.row_id === rowId);
    if (!currentTicket) throw new Error('티켓을 찾을 수 없습니다: ' + rowId);
    fillForm(currentTicket);
    renderVersionSelect(currentTicket.version_id || '');
    document.getElementById('btn-delete').style.display = '';
  } catch (err) {
    alert(err.message);
    location.href = 'index.html';
  } finally {
    document.getElementById('detail-loading').style.display = 'none';
  }
}

// ─── 버전 이동 드롭다운 ────────────────────────────────────────────────────────

function renderVersionSelect(selectedId) {
  const sel = document.getElementById('version-move-select');
  if (!sel) return;

  // 버전 없음: select 비활성화 처리 후 종료
  if (allVersions.length === 0) {
    sel.innerHTML = `<option value="">(${t('label_no_versions')})</option>`;
    sel.disabled = true;
    updateCurrentVersionLabel('');
    return;
  }

  sel.disabled = false;

  // 신규 모드이고 버전이 지정되지 않은 경우 sort_order 최소 버전으로 자동 선택
  if (isNewMode && !selectedId && allVersions.length > 0) {
    const first = allVersions.reduce((a, b) => a.sort_order <= b.sort_order ? a : b);
    selectedId = first.version_id;
    currentVersionId = selectedId;
  }

  // 현재 버전명 표시
  updateCurrentVersionLabel(selectedId);

  // 기존 이벤트 리스너 중복 방지: 노드 교체
  const newSel = sel.cloneNode(false);
  sel.parentNode.replaceChild(newSel, sel);

  newSel.innerHTML = `<option value="">(${t('label_unassigned')})</option>` +
    allVersions.map(v =>
      `<option value="${escHtml(v.version_id)}">${escHtml(v.version_name)}</option>`
    ).join('');
  newSel.value = selectedId || '';

  newSel.addEventListener('change', async () => {
    const targetId = newSel.value;

    if (isNewMode) {
      // 신규 등록: currentVersionId만 갱신 (실제 이동은 addTicket 시)
      currentVersionId = targetId;
      updateCurrentVersionLabel(targetId);
      return;
    }

    // 수정 모드: 즉시 이동 처리
    const overlay = document.getElementById('detail-loading');
    if (overlay) overlay.style.display = 'flex';
    try {
      await moveTicket(currentTicket.row_id, targetId);
      currentTicket.version_id = targetId;
      updateCurrentVersionLabel(targetId);
    } catch (err) {
      alert(t('error_move_version') + err.message);
      newSel.value = currentTicket.version_id || '';
    } finally {
      if (overlay) overlay.style.display = 'none';
    }
  });
}

// 레이블 옆 "현재: 버전명" 텍스트 갱신 (버전 없으면 "미지정")
function updateCurrentVersionLabel(versionId) {
  const badge = document.getElementById('version-move-badge');
  if (!badge) return;
  const v = allVersions.find(v => v.version_id === versionId);
  badge.textContent = `${t('label_current')}: ${v ? v.version_name : t('label_unassigned')}`;
}

function fillForm(ticket) {
  uploadedFiles = [];
  removedFileUrls = [];
  // 티켓번호 — 읽기전용 + JIRA 링크 (수정 모드에선 바로가기 버튼 숨김 — static에 링크 포함)
  document.getElementById('btn-wjira-link').style.display = 'none';
  document.getElementById('ticket-id-edit-wrap').style.display = 'none';
  const staticEl = document.getElementById('ticket-id-static');
  staticEl.style.display = '';
  staticEl.innerHTML = `<a href="https://wjira.humaxdigital.com/browse/${ticket.ticket_id}" target="_blank">${ticket.ticket_id}</a>`;

  document.getElementById('title-input').value = ticket.title;
  if (ticket.title) document.getElementById('btn-clear-title').style.display = '';
  updateTitleTranslationHint(ticket);

  // 등록날짜 — 읽기전용
  document.getElementById('created-date').textContent = formatDate(ticket.created_date);

  // 확인버전 — 최대 4개 입력란
  const versions = (ticket.check_version || '').split('\n').map(v => v.trim());
  document.querySelectorAll('.version-input').forEach((inp, i) => {
    inp.value = versions[i] || '';
  });
  document.getElementById('assignee').value      = ticket.assignee      || '';
  populatePriorityOptions(ticket.priority || '');
  document.getElementById('status').value        = ticket.status        || '진행전';
  document.getElementById('verdict').value       = ticket.verdict       || '';
  document.getElementById('check-content').value = ticket.check_content || '';
  document.getElementById('note').value          = ticket.note          || '';
  document.getElementById('wjira-updated').checked = ticket.wjira_updated === 'OK';

  if (ticket.file_urls) {
    uploadedFiles = ticket.file_urls.split(',').map((entry, i) => parseFileEntry(entry.trim(), i)).filter(f => f.url);
    renderFileList();
  }

  [1,2,3].forEach(n => {
    document.querySelector(`.link-label-input[data-link-num="${n}"]`).value = ticket[`link${n}_label`] || '';
    document.querySelector(`.link-url-input[data-link-num="${n}"]`).value   = ticket[`link${n}_url`]   || '';
  });
  renderLinks();

  updatePriorityState();
  // fillForm이 끝난 뒤 dirty 초기화 (setValue로 발생한 이벤트 무시)
  setTimeout(resetDirty, 0);
}

// Rule 1: 같은 그룹(WW/MVN) + 같은 버전 활성 티켓 중 max priority + 1
function getSuggestedPriority(assignee, versionId) {
  if (!cachedAllTickets) return '1';
  const isMVN = assignee === 'MVN';
  const group = isMVN ? (cachedAllTickets.activeMVN || []) : (cachedAllTickets.activeWW || []);
  const filtered = versionId
    ? group.filter(tk => tk.version_id === versionId)
    : group;
  const maxPri = filtered.reduce((m, tk) => Math.max(m, Number(tk.priority) || 0), 0);
  return String(maxPri + 1);
}

// 실시순서는 읽기전용 input — 값만 세팅 (목록에서 DnD로 변경)
function populatePriorityOptions(currentVal) {
  document.getElementById('priority').value = currentVal || '';
}

// ─── 상태 변경 시 priority 초기화 ────────────────────────────────────────────

function setupStatusListener() {
  document.getElementById('status').addEventListener('change', updatePriorityState);
}

function updatePriorityState() {
  const status = document.getElementById('status').value;
  const isActive = ['진행중', '진행전', '재테스트'].includes(status);
  if (!isActive) document.getElementById('priority').value = '';
}

// ─── 파일 업로드 ──────────────────────────────────────────────────────────────

function setupLinkListeners() {
  document.querySelectorAll('.link-label-input, .link-url-input').forEach(inp => {
    inp.addEventListener('input', renderLinks);
  });
  document.getElementById('links-display').addEventListener('click', e => {
    const btn = e.target.closest('.link-clear-btn');
    if (!btn) return;
    const n = btn.dataset.linkNum;
    document.querySelector(`.link-label-input[data-link-num="${n}"]`).value = '';
    document.querySelector(`.link-url-input[data-link-num="${n}"]`).value   = '';
    renderLinks();
    markDirty();
  });
}

function setupFileUpload() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    for (const file of e.dataTransfer.files) addPendingFile(file);
  });

  fileInput.addEventListener('change', () => {
    for (const file of fileInput.files) addPendingFile(file);
    fileInput.value = '';
  });
}

function addPendingFile(file) {
  pendingFiles.push(file);
  markDirty();
  renderFileList();
}

// "name|size|url" 또는 구버전 "url" 파싱
function parseFileEntry(entry, fallbackIdx) {
  const firstPipe = entry.indexOf('|');
  if (firstPipe > 0) {
    const name = entry.slice(0, firstPipe);
    const rest  = entry.slice(firstPipe + 1);
    const secondPipe = rest.indexOf('|');
    const size = secondPipe >= 0 ? Number(rest.slice(0, secondPipe)) || 0 : 0;
    const url  = secondPipe >= 0 ? rest.slice(secondPipe + 1) : rest;
    return { name: name || ('파일 ' + (fallbackIdx + 1)), size, url };
  }
  // 구버전: plain URL
  return { name: '파일 ' + (fallbackIdx + 1), size: 0, url: entry };
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

const CLIP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;

const VIEWABLE_EXTS = new Set(['jpg','jpeg','png','gif','webp','svg','bmp','pdf','txt','csv','log','md','json','xml','html','htm']);

function isViewable(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return VIEWABLE_EXTS.has(ext);
}

function driveDownloadUrl(viewUrl) {
  const m = viewUrl.match(/\/d\/([^\/]+)\//);
  return m ? `https://drive.google.com/uc?export=download&id=${m[1]}` : viewUrl;
}

function renderFileList() {
  const container = document.getElementById('file-list');

  const savedHtml = uploadedFiles.map((f, idx) => {
    const dlUrl = driveDownloadUrl(f.url);
    const nameHtml = isViewable(f.name)
      ? `<a href="${f.url}" target="_blank" class="file-name file-name-link">${escHtml(f.name)}</a>`
      : `<span class="file-name">${escHtml(f.name)}</span>`;
    const sizeHtml = f.size ? `<span class="file-size">${formatSize(f.size)}</span>` : '';
    return `<div class="file-item">
      <span class="file-clip">${CLIP_SVG}</span>
      ${nameHtml}
      ${sizeHtml}
      <div class="file-actions">
        <a href="${dlUrl}" target="_blank" class="btn btn-secondary btn-file-action">다운로드</a>
        <button type="button" class="btn btn-file-delete btn-file-action" data-type="saved" data-idx="${idx}">삭제</button>
      </div>
    </div>`;
  }).join('');

  const pendingHtml = pendingFiles.map((file, idx) =>
    `<div class="file-item file-item-pending">
      <span class="file-clip">⏳</span>
      <span class="file-name">${escHtml(file.name)}</span>
      <span class="file-size">${formatSize(file.size)}</span>
      <div class="file-actions">
        <button type="button" class="btn btn-file-delete btn-file-action" data-type="pending" data-idx="${idx}">삭제</button>
      </div>
    </div>`
  ).join('');

  container.innerHTML = savedHtml + pendingHtml;

  container.querySelectorAll('.btn-file-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      if (btn.dataset.type === 'saved') {
        removedFileUrls.push(uploadedFiles[idx].url);
        uploadedFiles.splice(idx, 1);
      } else {
        pendingFiles.splice(idx, 1);
      }
      markDirty();
      renderFileList();
    });
  });
}

function renderLinks() {
  const display = document.getElementById('links-display');
  if (!display) return;
  const items = [1,2,3].map(n => ({
    num:   n,
    label: (document.querySelector(`.link-label-input[data-link-num="${n}"]`) || {}).value || '',
    url:   (document.querySelector(`.link-url-input[data-link-num="${n}"]`)   || {}).value || ''
  })).filter(item => item.url.trim());

  display.innerHTML = items.map(item => {
    const text = item.label.trim() || item.url;
    return `<div class="links-display-item">
      <a href="${escHtml(item.url)}" target="_blank" class="link-display-anchor">${escHtml(text)}</a>
      <button type="button" class="link-clear-btn" data-link-num="${item.num}" title="링크 삭제">×</button>
    </div>`;
  }).join('');
}

// ─── 삭제 ─────────────────────────────────────────────────────────────────────

function setDeletingState(deleting) {
  const overlay = document.getElementById('detail-loading');
  const text    = overlay && overlay.querySelector('.detail-loading-text');
  if (overlay) overlay.style.display = deleting ? 'flex' : 'none';
  if (text)    text.textContent = deleting ? '삭제 중...' : t('loading');
}

async function handleDelete() {
  if (!currentTicket) return;
  const confirmed = confirm(`[${currentTicket.ticket_id}] 티켓을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`);
  if (!confirmed) return;

  setDeletingState(true);
  try {
    await deleteTicket(currentTicket.row_id);
    // 삭제된 행이라 잠금도 사라짐 — heartbeat/리스너만 정리하고 즉시 이동
    stopHeartbeat();
    window.removeEventListener('beforeunload', handleLockBeforeUnload);
    currentRowId = '';
    resetDirty();
    location.href = 'index.html';
  } catch (err) {
    setDeletingState(false);
    alert('삭제에 실패했습니다: ' + err.message);
  }
}

// ─── 저장 ─────────────────────────────────────────────────────────────────────

let isSaving = false;

function setSavingState(saving) {
  isSaving = saving;
  const overlay = document.getElementById('detail-loading');
  const text    = overlay && overlay.querySelector('.detail-loading-text');
  if (overlay) overlay.style.display = saving ? 'flex' : 'none';
  if (text)    text.textContent = saving ? '저장 중...' : t('loading');
}

// 저장 중 페이지 이탈 경고
window.addEventListener('beforeunload', e => {
  if (isSaving || isDirty || pendingFiles.length > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// continueAfterSave: true → 폼 초기화 후 계속 등록, false → 목록으로 이동
async function handleSave(continueAfterSave = false) {
  if (isSaving) return;

  setSavingState(true);
  try {
    // pending 파일을 저장 시점에 Drive 업로드
    if (pendingFiles.length > 0) {
      const overlay = document.getElementById('detail-loading');
      const text    = overlay && overlay.querySelector('.detail-loading-text');
      for (let i = 0; i < pendingFiles.length; i++) {
        if (text) text.textContent = `업로드 중... (${i + 1}/${pendingFiles.length})`;
        const result = await uploadFile(pendingFiles[i]);
        uploadedFiles.push({ name: pendingFiles[i].name, size: pendingFiles[i].size, url: result.fileUrl });
      }
      pendingFiles = [];
      renderFileList();
    }

    let savedFormData = null;

    if (isNewMode) {
      const numPart = document.getElementById('ticket-id-num').value.trim();
      if (!numPart) { alert('티켓번호를 입력하세요.'); setSavingState(false); return; }
      const ticketId = getPrefix() + numPart;
      savedFormData = collectFormData();
      await addTicket({ ticket_id: ticketId, version_id: currentVersionId, ...savedFormData });
    } else {
      await updateTicket({ row_id: currentTicket.row_id, ...collectFormData() });
    }

    // 저장 성공 후 삭제 예정 Drive 파일 정리
    if (removedFileUrls.length > 0) {
      try { await trashDriveFiles(removedFileUrls); } catch (e) { /* 무시 */ }
      removedFileUrls = [];
    }

    resetDirty();
    setSavingState(false);

    if (continueAfterSave && isNewMode && savedFormData) {
      // 저장 후 계속 등록: 폼 초기화 + 실시순서 +1
      resetFormForContinue(savedFormData);
    } else {
      // 저장 후 목록으로 (잠금 해제를 기다리지 않고 즉시 이동)
      releaseLockNow();
      location.href = 'index.html';
    }
  } catch (err) {
    alert(t('save_error') + '\n' + err.message);
    setSavingState(false);
  }
}

// 저장 후 계속 등록: 폼 초기화 + 실시순서 자동 +1 (추가 API 호출 없음)
function resetFormForContinue(savedFormData) {
  // 방금 저장한 티켓을 캐시에 추가 (같은 버전+그룹으로 max+1 계산에 포함)
  if (cachedAllTickets && savedFormData.priority) {
    const isMVN = savedFormData.assignee === 'MVN';
    const arr   = isMVN ? cachedAllTickets.activeMVN : cachedAllTickets.activeWW;
    arr.push({ priority: savedFormData.priority, assignee: savedFormData.assignee, version_id: currentVersionId, row_id: '__saved__' });
  }
  // 담당자 기반 같은 그룹+버전 max+1 계산 (Rule 1)
  const assigneeEl = document.getElementById('assignee');
  const nextPri    = getSuggestedPriority(assigneeEl.value, currentVersionId);

  // 티켓번호·이슈명·확인버전·결과·확인내용·비고·파일 초기화
  document.getElementById('ticket-id-num').value = '';
  document.getElementById('title-input').value   = '';
  document.getElementById('btn-clear-title').style.display = 'none';
  document.querySelectorAll('.version-input').forEach(inp => { inp.value = ''; });
  document.getElementById('verdict').value        = '';
  document.getElementById('status').value         = '진행전';
  document.getElementById('check-content').value  = '';
  document.getElementById('note').value           = '';
  document.getElementById('wjira-updated').checked = false;
  uploadedFiles   = [];
  pendingFiles    = [];
  removedFileUrls = [];
  renderFileList();
  document.querySelectorAll('.link-label-input, .link-url-input').forEach(inp => { inp.value = ''; });
  renderLinks();

  // 담당자·버전은 그대로 유지, 실시순서만 +1로 갱신
  updatePriorityState();
  populatePriorityOptions(nextPri);

  resetDirty();
  document.getElementById('ticket-id-num').focus();
}

function collectFormData() {
  const status   = document.getElementById('status').value;
  const isActive = ['진행중', '진행전', '재테스트'].includes(status);

  return {
    title:         document.getElementById('title-input').value,
    check_version: Array.from(document.querySelectorAll('.version-input'))
      .map(inp => inp.value.trim()).filter(Boolean).join('\n'),
    assignee:      document.getElementById('assignee').value,
    priority:      isActive ? (document.getElementById('priority').value || '') : '',
    status,
    verdict:       document.getElementById('verdict').value,
    check_content: document.getElementById('check-content').value,
    note:          document.getElementById('note').value,
    wjira_updated: document.getElementById('wjira-updated').checked ? 'OK' : '',
    file_urls:     uploadedFiles.map(f => `${f.name}|${f.size || 0}|${f.url}`).join(','),
    link1_label:   document.querySelector('.link-label-input[data-link-num="1"]').value,
    link1_url:     document.querySelector('.link-url-input[data-link-num="1"]').value,
    link2_label:   document.querySelector('.link-label-input[data-link-num="2"]').value,
    link2_url:     document.querySelector('.link-url-input[data-link-num="2"]').value,
    link3_label:   document.querySelector('.link-label-input[data-link-num="3"]').value,
    link3_url:     document.querySelector('.link-url-input[data-link-num="3"]').value,
  };
}

// ─── 날짜 포맷 ────────────────────────────────────────────────────────────────

function formatDate(raw) {
  if (!raw) return '-';
  const d = (raw instanceof Date) ? raw : new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── 이슈명 번역 힌트 (상세 페이지) ──────────────────────────────────────────────

function updateTitleTranslationHint(ticket) {
  const hint = document.getElementById('title-translation-hint');
  if (!hint) return;
  const lang = getLang();
  const hasJapanese = JP_CHAR_RE.test(ticket.title || '');
  let translated = '';
  let langLabel  = '';
  // 원문에 일본어가 없는데 실제로 번역된 경우(순수 영어 등)는 "번역 / 원문" 슬래시 병기 — index.js와 동일 로직
  if (lang === 'ko' && ticket.title_ko && ticket.title_ko !== ticket.title) {
    translated = hasJapanese ? ticket.title_ko : `${ticket.title_ko} / ${ticket.title}`;
    langLabel = '한국어';
  } else if (lang === 'vi' && ticket.title_vi && ticket.title_vi !== ticket.title) {
    translated = hasJapanese ? ticket.title_vi : `${ticket.title_vi} / ${ticket.title}`;
    langLabel = 'Tiếng Việt';
  }
  if (translated) {
    hint.innerHTML =
      `<span class="title-hint-label">${escHtml(langLabel)}:</span>` +
      `<span class="title-hint-text">${escHtml(translated)}</span>`;
    hint.style.display = 'flex';
  } else {
    hint.style.display = 'none';
  }
}

// ─── 언어/번역 ────────────────────────────────────────────────────────────────

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const base = t(el.dataset.i18nPlaceholder);
    const num  = el.dataset.versionNum;
    el.placeholder = num ? base + ' ' + num : base;
  });
  document.querySelectorAll('[data-i18n-version-label]').forEach(el => {
    const base = t(el.dataset.i18nVersionLabel);
    const num  = el.dataset.versionNum;
    el.textContent = num ? base + ' ' + num : base;
  });
  document.title = t('app_title');
}

// ─── 토스트 ───────────────────────────────────────────────────────────────────

let _toastTimer = null;
function showToast(msg) {
  let el = document.getElementById('app-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-toast';
    el.className = 'app-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;

  // 버튼 중앙 X, 카드 상단~버튼 상단 중간 Y에 배치
  const btn  = document.getElementById('btn-wjira-link');
  const card = document.querySelector('.detail-card');
  if (btn && card) {
    const b = btn.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const cx = b.left + b.width / 2;
    const cy = (c.top + b.top) / 2;
    el.style.left = cx + 'px';
    el.style.top  = cy + 'px';
    // 카드 좌우 경계를 벗어나지 않도록 maxWidth 제한 (여백 16px)
    const maxHalf = Math.min(cx - c.left, c.right - cx) - 16;
    el.style.maxWidth = Math.max(100, maxHalf * 2) + 'px';
  }

  el.classList.add('app-toast-show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('app-toast-show'), 3000);
}
