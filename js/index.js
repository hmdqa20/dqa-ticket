// 티켓 데이터 캐시
let allTickets = { activeWW: [], activeMVN: [], done: [], hold: [] };
let searchQuery = '';

document.addEventListener('DOMContentLoaded', async () => {
  initLangButtons();
  applyTranslations();
  await loadTickets();

  document.getElementById('btn-new').addEventListener('click', () => {
    location.href = 'detail.html';
  });

  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderAll();
  });

  // 완료/보류 섹션 헤더 클릭 → 접기/펼치기
  document.getElementById('section-done-header').addEventListener('click', () => toggleSection('done'));
  document.getElementById('section-hold-header').addEventListener('click', () => toggleSection('hold'));
});

// ─── 데이터 로드 ──────────────────────────────────────────────────────────────

async function loadTickets() {
  showLoading(true);
  showError(false);
  try {
    allTickets = await getTickets();
    renderAll();
  } catch (err) {
    showError(true, err.message);
  } finally {
    showLoading(false);
  }
}

// ─── 렌더링 ───────────────────────────────────────────────────────────────────

function filterTickets(tickets) {
  if (!searchQuery) return tickets;
  return tickets.filter(ticket =>
    ticket.ticket_id.toLowerCase().includes(searchQuery) ||
    ticket.title.toLowerCase().includes(searchQuery)
  );
}

function renderAll() {
  renderSection('activeWW',  filterTickets(allTickets.activeWW),  false);
  renderSection('activeMVN', filterTickets(allTickets.activeMVN), false);
  renderSection('done',      filterTickets(allTickets.done),      true);
  renderSection('hold',      filterTickets(allTickets.hold),      true);
  updateCounts();
}

function renderSection(group, tickets, dimmed) {
  const tbody = document.getElementById('tbody-' + group);
  if (!tbody) return;

  if (tickets.length === 0) {
    tbody.innerHTML = `<tr class="no-data"><td colspan="7">${t('no_tickets')}</td></tr>`;
    return;
  }

  tbody.innerHTML = tickets.map(ticket => buildRow(ticket, dimmed)).join('');

  // 행 클릭 → detail 페이지 이동 (JIRA 링크 클릭은 제외)
  tbody.querySelectorAll('tr[data-row-id]').forEach(tr => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      location.href = 'detail.html?id=' + tr.dataset.rowId;
    });
  });
}

function buildRow(ticket, dimmed) {
  const priorityBadge = (ticket.priority !== '' && ticket.priority !== null && ticket.priority !== undefined)
    ? `<span class="badge priority-${ticket.priority}">${ticket.priority}</span>` : '';

  const wjiraBadge = ticket.wjira_updated === 'OK'
    ? '<span class="badge badge-ok">OK</span>' : '';

  const statusClass = { '진행중': 'status-active', '진행전': 'status-pending', '완료': 'status-done', '보류': 'status-hold', 'N/A': 'status-na' }[ticket.status] || '';

  const verdictClass = ticket.verdict === 'OK' ? 'verdict-ok' : ticket.verdict === 'NG' ? 'verdict-ng' : '';

  return `
    <tr data-row-id="${escHtml(ticket.row_id)}" class="${dimmed ? 'dimmed' : ''}">
      <td><a href="https://wjira.humaxdigital.com/browse/${escHtml(ticket.ticket_id)}" target="_blank" class="ticket-link">${escHtml(ticket.ticket_id)}</a></td>
      <td class="title-cell" title="${escHtml(ticket.title)}">${escHtml(ticket.title)}</td>
      <td>${escHtml(ticket.check_version)}</td>
      <td>${escHtml(ticket.assignee)}${priorityBadge}</td>
      <td><span class="status-badge ${statusClass}">${escHtml(ticket.status)}</span></td>
      <td class="${verdictClass}">${escHtml(ticket.verdict)}</td>
      <td>${wjiraBadge}</td>
    </tr>`;
}

function updateCounts() {
  ['activeWW', 'activeMVN', 'done', 'hold'].forEach(group => {
    const el = document.getElementById('count-' + group);
    if (el) el.textContent = filterTickets(allTickets[group]).length;
  });
}

// ─── 섹션 접기/펼치기 ─────────────────────────────────────────────────────────

function toggleSection(group) {
  const body = document.getElementById('section-' + group + '-body');
  const icon = document.getElementById('toggle-' + group);
  if (!body || !icon) return;
  const nowCollapsed = body.classList.toggle('collapsed');
  icon.textContent = nowCollapsed ? '▶' : '▼';
}

// ─── UI 상태 ──────────────────────────────────────────────────────────────────

function showLoading(show) {
  document.getElementById('loading').style.display = show ? 'flex' : 'none';
}

function showError(show, msg) {
  const el = document.getElementById('error-msg');
  el.style.display = show ? 'flex' : 'none';
  if (show && msg) el.querySelector('.error-text').textContent = msg;
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
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.title = t('app_title');
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
