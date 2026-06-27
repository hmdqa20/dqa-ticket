function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let isNewMode = false;
let currentTicket = null;
let uploadedFiles = [];    // 이미 Drive에 저장된 {name, size, url} 목록
let pendingFiles = [];     // 아직 업로드 안 된 File 객체 목록 (저장 시 업로드)
let removedFileUrls = [];  // 삭제 예정 Drive 파일 URL (저장 시 Drive에서 제거)
let cachedAllTickets = null;
let isDirty = false;
let currentVersionId = '';  // 신규 등록 시 소속 버전 (URL 파라미터)
let allVersions = [];       // 전체 버전 목록 (드롭다운용)

function markDirty() { isDirty = true; }
function resetDirty() { isDirty = false; }

function confirmLeave() {
  if (!isDirty && pendingFiles.length === 0) return true;
  return confirm('저장하지 않은 변경 사항이 있습니다. 페이지를 떠나시겠습니까?');
}

document.addEventListener('DOMContentLoaded', async () => {
  applyTranslations();

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

  document.getElementById('btn-save-top').addEventListener('click', handleSave);
  const navigateToList = () => { resetDirty(); pendingFiles = []; location.href = 'index.html'; };
  document.getElementById('btn-cancel-top').addEventListener('click', () => { if (confirmLeave()) navigateToList(); });
  document.getElementById('btn-back').addEventListener('click',       () => { if (confirmLeave()) navigateToList(); });
  document.getElementById('btn-delete').addEventListener('click', handleDelete);
  document.getElementById('btn-clone').addEventListener('click', handleClone);

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

  // 신규 모드에서도 활성 티켓 수 기반으로 옵션 생성, 버전 목록도 함께 로드
  try {
    [cachedAllTickets, allVersions] = await Promise.all([getTickets(), getVersions()]);
  } catch (_) {}
  renderVersionSelect(currentVersionId);
  const activeAll  = [...(cachedAllTickets?.activeWW ?? []), ...(cachedAllTickets?.activeMVN ?? [])];
  const maxPri     = activeAll.reduce((m, tk) => Math.max(m, Number(tk.priority) || 0), 0);
  const defaultPri = String(maxPri + 1);
  populatePriorityOptions(defaultPri);

  // 바로가기: 번호 입력 시 활성화
  const numInput = document.getElementById('ticket-id-num');
  const linkBtn  = document.getElementById('btn-wjira-link');
  numInput.addEventListener('input', () => {
    linkBtn.disabled = !numInput.value.trim();
  });
  linkBtn.addEventListener('click', () => {
    const num = numInput.value.trim();
    if (num) window.open('https://wjira.humaxdigital.com/browse/XAX2-' + num, '_blank');
  });

  // btn-fetch는 숨겨두되 함수는 유지
  document.getElementById('btn-fetch').addEventListener('click', async () => {
    const numPart = document.getElementById('ticket-id-num').value.trim();
    if (!numPart) return;
    const ticketId = 'XAX2-' + numPart;
    const btn = document.getElementById('btn-fetch');
    btn.disabled = true;
    btn.textContent = '...';
    try {
      const result = await fetchJira(ticketId);
      document.getElementById('title-input').value = result.title;
    } catch (err) {
      alert('JIRA 조회 실패: ' + err.message);
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
  try {
    const [data, vers] = await Promise.all([getTickets(), getVersions()]);
    cachedAllTickets = data;
    allVersions = vers;
    const all = [...data.activeWW, ...data.activeMVN, ...data.done, ...data.hold];
    currentTicket = all.find(tk => tk.row_id === rowId);
    if (!currentTicket) throw new Error('티켓을 찾을 수 없습니다: ' + rowId);
    fillForm(currentTicket);
    renderVersionSelect(currentTicket.version_id || '');
    document.getElementById('btn-delete').style.display = '';
    document.getElementById('btn-clone').style.display = '';
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
    sel.innerHTML = '<option value="">(버전 없음)</option>';
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

  newSel.innerHTML = `<option value="">(미지정)</option>` +
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
      alert('버전 이동에 실패했습니다: ' + err.message);
      newSel.value = currentTicket.version_id || '';
    } finally {
      if (overlay) overlay.style.display = 'none';
    }
  });
}

// 레이블 옆 "현재: 버전명" 텍스트 갱신 (버전 없으면 "미지정")
function updateCurrentVersionLabel(versionId) {
  const badge = document.getElementById('version-move-current');
  if (!badge) return;
  const v = allVersions.find(v => v.version_id === versionId);
  badge.textContent = `현재: ${v ? v.version_name : '미지정'}`;
}

function fillForm(ticket) {
  uploadedFiles = [];
  removedFileUrls = [];
  // 티켓번호 — 읽기전용 + JIRA 링크
  document.getElementById('ticket-id-edit-wrap').style.display = 'none';
  const staticEl = document.getElementById('ticket-id-static');
  staticEl.style.display = '';
  staticEl.innerHTML = `<a href="https://wjira.humaxdigital.com/browse/${ticket.ticket_id}" target="_blank">${ticket.ticket_id}</a>`;

  // 바로가기 버튼 활성화
  const linkBtn = document.getElementById('btn-wjira-link');
  linkBtn.disabled = false;
  linkBtn.addEventListener('click', () => {
    window.open('https://wjira.humaxdigital.com/browse/' + ticket.ticket_id, '_blank');
  });

  document.getElementById('title-input').value = ticket.title;
  if (ticket.title) document.getElementById('btn-clear-title').style.display = '';

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

  updatePriorityState();
  // fillForm이 끝난 뒤 dirty 초기화 (setValue로 발생한 이벤트 무시)
  setTimeout(resetDirty, 0);
}

function populatePriorityOptions(currentVal) {
  const activeCount = cachedAllTickets
    ? cachedAllTickets.activeWW.length + cachedAllTickets.activeMVN.length
    : 5;
  // 신규 등록 시 다음 빈 슬롯(활성수+1)과 선택값(currentVal)까지 포함되도록 보정
  const max = Math.max(5, activeCount + 1, Number(currentVal) || 0);
  const sel = document.getElementById('priority');
  sel.innerHTML = ['', ...Array.from({length: max}, (_, i) => String(i + 1))]
    .map(v => `<option value="${v}"${currentVal === v ? ' selected' : ''}>${v || '—'}</option>`)
    .join('');
}

// ─── 상태 변경 시 priority 활성화 ─────────────────────────────────────────────

function setupStatusListener() {
  document.getElementById('status').addEventListener('change', updatePriorityState);
  document.getElementById('priority').addEventListener('change', handlePriorityChange);
}

async function handlePriorityChange() {
  const priorityEl  = document.getElementById('priority');
  const value       = priorityEl.value;
  const prevValue   = currentTicket ? String(currentTicket.priority ?? '') : '';
  if (!value || value === prevValue) return;

  if (!cachedAllTickets) cachedAllTickets = await getTickets();
  const activeAll = [...cachedAllTickets.activeWW, ...cachedAllTickets.activeMVN];
  const myRowId   = currentTicket?.row_id;
  const conflict  = activeAll.find(tk => tk.row_id !== myRowId && String(tk.priority) === value);

  if (!conflict) return;

  const msg = `${conflict.ticket_id} 티켓이 이미 ${value}순서로 배정되어 있습니다.\n\n확인하면 ${value}순서부터 기존 항목들이 뒤로 한 칸씩 밀립니다.`;
  const ok  = isCascadeSkippedToday() || await confirmCascade(msg);
  if (!ok) {
    priorityEl.value = prevValue;
    return;
  }

  // 캐스케이드 미리 반영 (저장 시 중복 방지)
  activeAll
    .filter(tk => tk.row_id !== myRowId && Number(tk.priority) >= Number(value))
    .sort((a, b) => Number(b.priority) - Number(a.priority))
    .forEach(tk => { tk.priority = String(Number(tk.priority) + 1); });
}

function updatePriorityState() {
  const status = document.getElementById('status').value;
  const isActive = ['진행중', '진행전', '재테스트'].includes(status);
  const priorityEl = document.getElementById('priority');
  priorityEl.disabled = !isActive;
  if (!isActive) priorityEl.value = '';
}

// ─── 파일 업로드 ──────────────────────────────────────────────────────────────

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

// ─── 삭제 ─────────────────────────────────────────────────────────────────────

// ─── 복제 ─────────────────────────────────────────────────────────────────────

async function handleClone() {
  if (!currentTicket) return;
  const confirmed = confirm(`[${currentTicket.ticket_id}] 티켓을 복제하여 재테스트 항목을 만드시겠습니까?`);
  if (!confirmed) return;

  const overlay = document.getElementById('detail-loading');
  const text    = overlay && overlay.querySelector('.detail-loading-text');
  if (overlay) overlay.style.display = 'flex';
  if (text)    text.textContent = '복제 중...';

  try {
    const result = await addTicket({
      ticket_id:     currentTicket.ticket_id,
      title:         currentTicket.title,
      check_version: currentTicket.check_version,
      assignee:      currentTicket.assignee,
      priority:      '',
      status:        '진행전',
      verdict:       '',
      check_content: currentTicket.check_content,
      note:          currentTicket.note,
      wjira_updated: '',
      file_urls:     '',
      retest_ref:    currentTicket.ticket_id,
      version_id:    currentTicket.version_id || ''
    });
    resetDirty();
    location.href = 'detail.html?id=' + result.row_id;
  } catch (err) {
    if (overlay) overlay.style.display = 'none';
    alert('복제에 실패했습니다: ' + err.message);
  }
}

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

async function handleSave() {
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

    if (isNewMode) {
      const numPart = document.getElementById('ticket-id-num').value.trim();
      if (!numPart) { alert('티켓번호를 입력하세요.'); return; }
      const ticketId = 'XAX2-' + numPart;
      await addTicket({ ticket_id: ticketId, version_id: currentVersionId, ...collectFormData() });
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
  } catch (err) {
    alert(t('save_error') + '\n' + err.message);
    setSavingState(false);
  }
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
    file_urls:     uploadedFiles.map(f => `${f.name}|${f.size || 0}|${f.url}`).join(',')
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
  document.title = t('app_title');
}
