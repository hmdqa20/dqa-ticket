let isNewMode = false;
let currentTicket = null;
let uploadedFileUrls = []; // 기존 + 새로 업로드된 파일 URL 목록

document.addEventListener('DOMContentLoaded', async () => {
  initLangButtons();
  applyTranslations();

  const rowId = new URLSearchParams(location.search).get('id');

  if (rowId) {
    isNewMode = false;
    await loadTicket(rowId);
  } else {
    isNewMode = true;
    initNewMode();
  }

  setupStatusListener();
  setupFileUpload();

  document.getElementById('btn-save').addEventListener('click', handleSave);
  document.getElementById('btn-cancel').addEventListener('click', () => location.href = 'index.html');
  document.getElementById('btn-back').addEventListener('click', () => location.href = 'index.html');
});

// ─── 신규 모드 ────────────────────────────────────────────────────────────────

function initNewMode() {
  document.getElementById('page-title').textContent = t('page_title_new');
  document.getElementById('ticket-id-input').style.display = '';
  document.getElementById('ticket-id-static').style.display = 'none';
  document.getElementById('btn-fetch').style.display = '';
  document.getElementById('created-date').textContent = '자동 입력';

  document.getElementById('btn-fetch').addEventListener('click', async () => {
    const ticketId = document.getElementById('ticket-id-input').value.trim();
    if (!ticketId) return;
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
  try {
    const data = await getTickets();
    const all = [...data.activeWW, ...data.activeMVN, ...data.done, ...data.hold];
    currentTicket = all.find(tk => tk.row_id === rowId);
    if (!currentTicket) throw new Error('티켓을 찾을 수 없습니다: ' + rowId);
    fillForm(currentTicket);
  } catch (err) {
    alert(err.message);
    location.href = 'index.html';
  }
}

function fillForm(ticket) {
  // 티켓번호 — 읽기전용 + JIRA 링크
  document.getElementById('ticket-id-input').style.display = 'none';
  document.getElementById('btn-fetch').style.display = 'none';
  const staticEl = document.getElementById('ticket-id-static');
  staticEl.style.display = '';
  staticEl.innerHTML = `<a href="https://wjira.humaxdigital.com/browse/${ticket.ticket_id}" target="_blank">${ticket.ticket_id}</a>`;

  // 이슈명 — 읽기전용
  const titleInput = document.getElementById('title-input');
  titleInput.value = ticket.title;
  titleInput.setAttribute('readonly', 'readonly');
  titleInput.style.background = '#f9fafb';

  // 생성날짜 — 읽기전용
  document.getElementById('created-date').textContent = ticket.created_date || '-';

  // 수정 가능 필드
  document.getElementById('check-version').value = ticket.check_version || '';
  document.getElementById('assignee').value      = ticket.assignee      || '';
  document.getElementById('priority').value      = ticket.priority      || '';
  document.getElementById('status').value        = ticket.status        || '진행전';
  document.getElementById('verdict').value       = ticket.verdict       || '';
  document.getElementById('check-content').value = ticket.check_content || '';
  document.getElementById('note').value          = ticket.note          || '';
  document.getElementById('wjira-updated').checked = ticket.wjira_updated === 'OK';

  // 기존 파일 URL 목록
  if (ticket.file_urls) {
    uploadedFileUrls = ticket.file_urls.split(',').map(u => u.trim()).filter(Boolean);
    renderFileList();
  }

  updatePriorityState();
}

// ─── 상태 변경 시 priority 활성화 ─────────────────────────────────────────────

function setupStatusListener() {
  document.getElementById('status').addEventListener('change', updatePriorityState);
}

function updatePriorityState() {
  const status = document.getElementById('status').value;
  const isActive = ['진행중', '진행전'].includes(status);
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

  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    for (const file of e.dataTransfer.files) await handleFileUpload(file);
  });

  fileInput.addEventListener('change', async () => {
    for (const file of fileInput.files) await handleFileUpload(file);
    fileInput.value = '';
  });
}

async function handleFileUpload(file) {
  const dropZone = document.getElementById('drop-zone');
  dropZone.textContent = t('uploading');
  dropZone.classList.add('uploading');
  try {
    const result = await uploadFile(file);
    uploadedFileUrls.push(result.fileUrl);
    renderFileList();
  } catch (err) {
    alert('업로드 실패: ' + err.message);
  } finally {
    dropZone.textContent = t('drag_drop');
    dropZone.classList.remove('uploading');
  }
}

function renderFileList() {
  const container = document.getElementById('file-list');
  container.innerHTML = uploadedFileUrls.map((url, idx) => {
    const name = decodeURIComponent(url.split('/').filter(Boolean).pop() || ('파일 ' + (idx + 1)));
    return `<div class="file-item">
      <a href="${url}" target="_blank">📎 ${name}</a>
      <button type="button" class="btn-remove-file" data-idx="${idx}">×</button>
    </div>`;
  }).join('');

  container.querySelectorAll('.btn-remove-file').forEach(btn => {
    btn.addEventListener('click', () => {
      uploadedFileUrls.splice(Number(btn.dataset.idx), 1);
      renderFileList();
    });
  });
}

// ─── 저장 ─────────────────────────────────────────────────────────────────────

async function handleSave() {
  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.textContent = '저장 중...';

  try {
    if (isNewMode) {
      const ticketId = document.getElementById('ticket-id-input').value.trim();
      if (!ticketId) { alert('티켓번호를 입력하세요.'); return; }
      await addTicket({ ticket_id: ticketId, ...collectFormData() });
    } else {
      await updateTicket({ row_id: currentTicket.row_id, ...collectFormData() });
    }
    location.href = 'index.html';
  } catch (err) {
    alert(t('save_error') + '\n' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = t('btn_save');
  }
}

function collectFormData() {
  const status   = document.getElementById('status').value;
  const isActive = ['진행중', '진행전'].includes(status);

  return {
    title:         document.getElementById('title-input').value,
    check_version: document.getElementById('check-version').value,
    assignee:      document.getElementById('assignee').value,
    priority:      isActive ? (document.getElementById('priority').value || '') : '',
    status,
    verdict:       document.getElementById('verdict').value,
    check_content: document.getElementById('check-content').value,
    note:          document.getElementById('note').value,
    wjira_updated: document.getElementById('wjira-updated').checked ? 'OK' : '',
    file_urls:     uploadedFileUrls.join(',')
  };
}

// ─── 언어/번역 ────────────────────────────────────────────────────────────────

function initLangButtons() {
  const lang = getLang();
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.title = t('app_title');
}
