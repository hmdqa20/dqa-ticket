// 수정: 2026-06-28 14:00 — 실시순서 Rule4: 같은 그룹+버전 필터, 연속된 번호만 cascade (빈칸에서 중지)
// 수정: 2026-06-28 10:00 — loadVersions 제거, loadTickets에서 versions 포함 처리
// 티켓 데이터 캐시
let allTickets = { activeWW: [], activeMVN: [], done: [], hold: [] };
let searchQuery = '';
let activeFilters = { assignee: '', status: '', verdict: '', version: '', wjira: '' };
const userCollapsed = new Set(); // 사용자가 직접 접은 섹션

// "전체" 가상 탭 식별자
const ALL_VERSION = '__ALL__';

// 버전 탭 상태
let versions = [];                  // [{version_id, version_name, status, ...}]
let currentVersionId = ALL_VERSION; // 현재 선택된 버전 (ALL_VERSION=전체)

const PRESET_ASSIGNEES = ['정기석', '박수완', '한국', 'MVN'];
const LEGACY_ASSIGNEES = ['박수원', '홍경두'];

document.addEventListener('DOMContentLoaded', async () => {
  applyTranslations();
  buildAllHeaders();

  // 마지막 선택 버전 복원
  currentVersionId = localStorage.getItem('dqa_current_version') || ALL_VERSION;

  await loadTickets();

  document.getElementById('btn-new').addEventListener('click', () => {
    const vid = currentVersionId && currentVersionId !== ALL_VERSION ? '?version_id=' + encodeURIComponent(currentVersionId) : '';
    location.href = 'detail.html' + vid;
  });

  setupVersionSidebar();


  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderAll();
  });

  document.getElementById('section-ww-header').addEventListener('click', () => toggleSection('activeWW'));
  document.getElementById('section-mvn-header').addEventListener('click', () => toggleSection('activeMVN'));
  document.getElementById('section-done-header').addEventListener('click', () => toggleSection('done'));
  document.getElementById('section-hold-header').addEventListener('click', () => toggleSection('hold'));

  // 헤더 필터 변경 이벤트 (전체 문서 위임)
  document.addEventListener('change', (e) => {
    if (!e.target.classList.contains('th-filter-select')) return;
    const key = e.target.dataset.filterKey;
    const value = e.target.value;
    activeFilters[key] = value;
    // 모든 섹션 헤더 재빌드 (동기화 + active 상태 반영)
    buildAllHeaders();
    populateDynamicFilters();
    renderAll();
  });
});

// ─── 헤더 생성 ───────────────────────────────────────────────────────────────

// 컬럼 너비: 클립 | 티켓번호 | 이슈명(flex) | 확인버전 | 실시순서 | 담당자 | 진행상태 | 판정 | WJIRA
// 이슈명은 테이블 min-width(950px)에서 고정 컬럼 합(684px)을 뺀 나머지를 자동 배분 (≥266px 보장)
const COL_WIDTHS = ['24px', '110px', '', '110px', '80px', '90px', '100px', '70px', '100px'];

function buildAllHeaders() {
  [['ww', 'active'], ['mvn', 'active'], ['done', 'done'], ['hold', 'hold']].forEach(([id, type]) => {
    const tr = document.getElementById('thead-' + id);
    if (tr) tr.innerHTML = buildHeaderHtml(type);
  });
  // colgroup에 고정 너비 주입
  document.querySelectorAll('colgroup.ticket-cols').forEach(cg => {
    cg.innerHTML = COL_WIDTHS.map(w => `<col${w ? ` style="width:${w}"` : ''}>`).join('');
  });
}

const STATUS_LABEL_KEY = { '진행중':'status_active', '진행전':'status_pending', '재테스트':'status_retest', '완료':'status_done_opt', '보류':'status_hold_opt', 'N/A':'status_na' };
function statusLabel(v) { return t(STATUS_LABEL_KEY[v] || v); }

function buildHeaderHtml(sectionType = 'active') {
  const f = activeFilters;
  const sel = (key, val) => val === f[key] ? ' selected' : '';

  // 진행상태 옵션: 섹션 타입별 분리
  const statusOpts = sectionType === 'done'
    ? `<option value="완료"${sel('status','완료')}>${statusLabel('완료')}</option>`
    : sectionType === 'hold'
    ? `<option value="보류"${sel('status','보류')}>${statusLabel('보류')}</option><option value="N/A"${sel('status','N/A')}>N/A</option>`
    : `<option value="진행중"${sel('status','진행중')}>${statusLabel('진행중')}</option><option value="진행전"${sel('status','진행전')}>${statusLabel('진행전')}</option><option value="재테스트"${sel('status','재테스트')}>${statusLabel('재테스트')}</option>`;

  const wrap = (key, label, activeVal, inner, displayVal) =>
    `<span class="th-filter-wrap${activeVal ? ' active' : ''}">` +
    `<span class="th-filter-label">${activeVal ? escHtml(displayVal || activeVal) : label}</span>` +
    `<select class="th-filter-select" data-filter-key="${key}">${inner}</select>` +
    `</span>`;

  return `
    <th></th>
    <th>${t('col_ticket_id')}</th>
    <th>${t('col_title')}</th>
    <th>${wrap('version', t('col_check_version'), f.version, `<option value=""></option>`)}</th>
    <th>${t('col_order')}</th>
    <th>${wrap('assignee', t('col_assignee'), f.assignee, `<option value=""></option>`)}</th>
    <th>${wrap('status', t('col_status'), f.status, `<option value=""></option>${statusOpts}`, f.status ? statusLabel(f.status) : '')}</th>
    <th>${wrap('verdict', t('col_verdict'), f.verdict, `<option value=""></option><option value="OK"${sel('verdict','OK')}>OK</option><option value="NG"${sel('verdict','NG')}>NG</option>`)}</th>
    <th>${wrap('wjira', 'WJIRA 결과기재', f.wjira, `<option value=""></option><option value="OK"${sel('wjira','OK')}>기재완료</option><option value="none"${sel('wjira','none')}>미기재</option>`)}</th>
  `;
}

// ─── 데이터 로드 ──────────────────────────────────────────────────────────────

async function loadTickets() {
  showLoading(true);
  showError(false);
  try {
    const vid = currentVersionId === ALL_VERSION ? '' : currentVersionId;
    allTickets = await getTickets(vid);
    versions = allTickets.versions || [];
    // 저장된 선택 버전이 더 이상 존재하지 않으면 전체로 복귀
    if (currentVersionId !== ALL_VERSION && !versions.some(v => v.version_id === currentVersionId)) {
      currentVersionId = ALL_VERSION;
    }
    renderSidebar();
    populateDynamicFilters();
    renderAll();
  } catch (err) {
    showError(true, err.message);
  } finally {
    showLoading(false);
  }
}

// ─── 버전 사이드탭 ────────────────────────────────────────────────────────────

function renderSidebar() {
  const list = document.getElementById('version-list');
  if (!list) return;

  // "전체" 탭 + 각 버전 탭
  const allActive = currentVersionId === ALL_VERSION ? ' active' : '';
  let html = `<div class="version-item${allActive}" data-version-id="${ALL_VERSION}">
      <span class="version-name">${t('version_all')}</span>
    </div>`;

  html += versions.map(v => {
    const active = currentVersionId === v.version_id ? ' active' : '';
    const dotClass = v.status === '완료' ? 'dot-done' : 'dot-active';
    return `<div class="version-item${active}" data-version-id="${escHtml(v.version_id)}">
      <span class="version-dot ${dotClass}"></span>
      <span class="version-name">${escHtml(v.version_name)}</span>
    </div>`;
  }).join('');

  list.innerHTML = html;

  list.querySelectorAll('.version-item').forEach(item => {
    item.addEventListener('click', () => switchVersion(item.dataset.versionId));
  });
}

async function switchVersion(versionId) {
  if (versionId === currentVersionId) return;
  currentVersionId = versionId;
  localStorage.setItem('dqa_current_version', versionId);
  renderSidebar();
  await loadTickets();
}

function setupVersionSidebar() {
  // 새 버전 추가 버튼은 onclick으로 versions.html 이동 처리
}

// ─── 동적 필터 옵션 (담당자·확인버전) ────────────────────────────────────────

function populateDynamicFilters() {
  const all = allTicketsFlat();

  const assignees = [...new Set(all.map(tk => tk.assignee).filter(Boolean))].sort();
  document.querySelectorAll('.th-filter-select[data-filter-key="assignee"]').forEach(sel => {
    const cur = activeFilters.assignee;
    sel.innerHTML = `<option value=""></option>` +
      assignees.map(a => `<option value="${escHtml(a)}"${cur === a ? ' selected' : ''}>${escHtml(a)}</option>`).join('');
    const labelEl = sel.previousElementSibling;
    if (labelEl) labelEl.textContent = cur || t('col_assignee');
    sel.closest('.th-filter-wrap').classList.toggle('active', cur !== '');
  });

  const versions = [...new Set(
    all.flatMap(tk => (tk.check_version || '').split('\n').map(v => v.trim()).filter(Boolean))
  )].sort();
  document.querySelectorAll('.th-filter-select[data-filter-key="version"]').forEach(sel => {
    const cur = activeFilters.version;
    sel.innerHTML = `<option value=""></option>` +
      versions.map(v => `<option value="${escHtml(v)}"${cur === v ? ' selected' : ''}>${escHtml(v)}</option>`).join('');
    const labelEl = sel.previousElementSibling;
    if (labelEl) labelEl.textContent = cur || t('col_check_version');
    sel.closest('.th-filter-wrap').classList.toggle('active', cur !== '');
  });
}

function allTicketsFlat() {
  return [...allTickets.activeWW, ...allTickets.activeMVN, ...allTickets.done, ...allTickets.hold];
}

// ─── 필터링 ───────────────────────────────────────────────────────────────────

function filterTickets(tickets) {
  let result = tickets;

  if (searchQuery) {
    result = result.filter(tk =>
      tk.ticket_id.toLowerCase().includes(searchQuery) ||
      tk.title.toLowerCase().includes(searchQuery) ||
      (tk.check_version || '').toLowerCase().includes(searchQuery) ||
      (tk.assignee || '').toLowerCase().includes(searchQuery)
    );
  }

  if (activeFilters.assignee) result = result.filter(tk => tk.assignee === activeFilters.assignee);
  if (activeFilters.status)   result = result.filter(tk => tk.status === activeFilters.status);
  if (activeFilters.verdict)  result = result.filter(tk => tk.verdict === activeFilters.verdict);
  if (activeFilters.version)  result = result.filter(tk =>
    (tk.check_version || '').split('\n').map(v => v.trim()).includes(activeFilters.version)
  );
  if (activeFilters.wjira === 'OK')   result = result.filter(tk => tk.wjira_updated === 'OK');
  if (activeFilters.wjira === 'none') result = result.filter(tk => tk.wjira_updated !== 'OK');

  return result;
}

// ─── 렌더링 ───────────────────────────────────────────────────────────────────

function sortByPriority(tickets) {
  return [...tickets].sort((a, b) => {
    const pa = Number(a.priority) || Infinity;
    const pb = Number(b.priority) || Infinity;
    return pa - pb;
  });
}

function renderAll() {
  renderSection('activeWW',  filterTickets(sortByPriority(allTickets.activeWW)),  false);
  renderSection('activeMVN', filterTickets(sortByPriority(allTickets.activeMVN)), false);
  renderSection('done',      filterTickets(allTickets.done),      true);
  renderSection('hold',      filterTickets(allTickets.hold),      true);

  // 항목 수에 따라 activeWW/activeMVN/done/hold 섹션 자동 펼침/접힘
  for (const group of ['activeWW', 'activeMVN', 'done', 'hold']) {
    const body = document.getElementById('section-' + group + '-body');
    const icon = document.getElementById('toggle-' + group);
    if (!body || !icon) continue;
    const hasItems = filterTickets(allTickets[group]).length > 0;
    if (!hasItems) {
      body.classList.add('collapsed');
      icon.textContent = '▶';
    } else if (!userCollapsed.has(group)) {
      body.classList.remove('collapsed');
      icon.textContent = '▼';
    }
  }

  updateCounts();
}

function renderSection(group, tickets, dimmed) {
  const tbody = document.getElementById('tbody-' + group);
  if (!tbody) return;

  if (tickets.length === 0) {
    tbody.innerHTML = `<tr class="no-data"><td colspan="9">${t('no_tickets')}</td></tr>`;
    return;
  }

  tbody.innerHTML = tickets.map(ticket => buildRow(ticket, dimmed)).join('');

  tbody.querySelectorAll('.navigate-cell').forEach(td => {
    td.addEventListener('click', () => {
      const rowId = td.closest('tr').dataset.rowId;
      if (rowId) location.href = 'detail.html?id=' + rowId;
    });
  });

  tbody.querySelectorAll('.inline-select, .wjira-checkbox').forEach(el => {
    el.addEventListener('change', handleInlineChange);
  });

}

function buildRow(ticket, dimmed) {
  const pri = String(ticket.priority ?? '');
  const orderClass = pri === '1' ? 'order-1' : pri === '2' ? 'order-2' : pri === '3' ? 'order-3' : '';
  const statusClass = { '진행중': 'status-active', '진행전': 'status-pending', '재테스트': 'status-retest', '완료': 'status-done', '보류': 'status-hold', 'N/A': 'status-na' }[ticket.status] || '';
  const verdictClass = ticket.verdict === 'OK' ? 'verdict-ok' : ticket.verdict === 'NG' ? 'verdict-ng' : '';
  const hasFiles = ticket.file_urls && ticket.file_urls.trim();
  const isActive = ['진행중', '진행전', '재테스트'].includes(ticket.status);

  // 활성 티켓만 실시순서 드롭다운, 완료/보류는 — 표시
  const activeCount = allTickets.activeWW.length + allTickets.activeMVN.length;
  const maxOrder = Math.max(5, activeCount);
  const orderCell = isActive
    ? (() => {
        const opts = ['', ...Array.from({length: maxOrder}, (_, i) => String(i + 1))].map(v =>
          `<option value="${v}"${pri === v ? ' selected' : ''}>${v || '—'}</option>`
        ).join('');
        return `<select class="inline-select order-select ${orderClass}" data-field="priority" data-row-id="${escHtml(ticket.row_id)}">${opts}</select>`;
      })()
    : `<span class="order-dash">—</span>`;

  const statusOptions = ['진행중', '진행전', '재테스트', '완료', '보류', 'N/A'].map(v =>
    `<option value="${v}"${ticket.status === v ? ' selected' : ''}>${statusLabel(v)}</option>`
  ).join('');

  const verdictOptions = ['', 'OK', 'NG'].map(v =>
    `<option value="${v}"${ticket.verdict === v ? ' selected' : ''}>${v || '—'}</option>`
  ).join('');

  const wjiraChecked = ticket.wjira_updated === 'OK' ? ' checked' : '';

  const versionHtml = (ticket.check_version || '').split('\n')
    .map(v => v.trim()).filter(Boolean)
    .map(v => `<div class="version-line">${escHtml(v)}</div>`).join('');

  return `
    <tr data-row-id="${escHtml(ticket.row_id)}" class="${dimmed ? 'dimmed' : ''}">
      <td class="clip-cell">${hasFiles ? `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>` : ''}</td>
      <td class="ticket-id-cell"><a href="https://wjira.humaxdigital.com/browse/${escHtml(ticket.ticket_id)}" target="_blank" class="ticket-link">${escHtml(ticket.ticket_id)}</a></td>
      <td class="title-cell navigate-cell" title="${escHtml(ticket.title)}">${escHtml(ticket.title)}</td>
      <td class="navigate-cell version-cell">${versionHtml}</td>
      <td>${orderCell}</td>
      <td class="assignee-cell">${buildAssigneeSelectHtml(ticket.assignee || '', ticket.row_id)}</td>
      <td><select class="inline-select status-select ${statusClass}" data-field="status" data-row-id="${escHtml(ticket.row_id)}">${statusOptions}</select></td>
      <td><select class="inline-select verdict-select ${verdictClass}" data-field="verdict" data-row-id="${escHtml(ticket.row_id)}">${verdictOptions}</select></td>
      <td class="wjira-cell"><input type="checkbox" class="wjira-checkbox" data-field="wjira_updated" data-row-id="${escHtml(ticket.row_id)}"${wjiraChecked}></td>
    </tr>`;
}

function updateCounts() {
  ['activeWW', 'activeMVN', 'done', 'hold'].forEach(group => {
    const el = document.getElementById('count-' + group);
    if (el) el.textContent = filterTickets(allTickets[group]).length;
  });
}

// ─── 담당자 셀 ────────────────────────────────────────────────────────────────

function buildAssigneeSelectHtml(av, rowId) {
  const isPreset = PRESET_ASSIGNEES.includes(av);
  const isLegacy = LEGACY_ASSIGNEES.includes(av);
  const showCustom = av !== '' && !isPreset && !isLegacy;
  let opts = `<option value=""></option>`;
  opts += PRESET_ASSIGNEES.map(v =>
    `<option value="${escHtml(v)}"${av === v ? ' selected' : ''}>${escHtml(v)}</option>`
  ).join('');
  if (showCustom) opts += `<option value="${escHtml(av)}" selected>${escHtml(av)}</option>`;
  opts += `<option value="__custom__">직접입력...</option>`;
  return `<select class="inline-select assignee-select" data-field="assignee" data-row-id="${escHtml(rowId)}">${opts}</select>`;
}

function activateCustomAssignee(select) {
  const rowId = select.dataset.rowId;
  let origValue = '';
  for (const group of ['activeWW', 'activeMVN', 'done', 'hold']) {
    const ticket = allTickets[group].find(tk => tk.row_id === rowId);
    if (ticket) { origValue = ticket.assignee || ''; break; }
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-input assignee-input';
  input.placeholder = '담당자 입력...';
  input.value = PRESET_ASSIGNEES.includes(origValue) ? '' : origValue;
  select.replaceWith(input);
  input.focus();

  async function commit() {
    const value = input.value.trim();
    const saveValue = value || origValue;
    for (const group of ['activeWW', 'activeMVN', 'done', 'hold']) {
      const ticket = allTickets[group].find(tk => tk.row_id === rowId);
      if (ticket) { ticket.assignee = saveValue; break; }
    }
    const td = input.parentElement;
    td.innerHTML = buildAssigneeSelectHtml(saveValue, rowId);
    td.querySelector('.assignee-select').addEventListener('change', handleInlineChange);
    if (value) {
      try { await updateTicket({ row_id: rowId, assignee: value }); }
      catch (err) { console.error(err); alert('저장 실패: ' + err.message); }
    }
  }

  function cancel() {
    const td = input.parentElement;
    if (!td) return;
    td.innerHTML = buildAssigneeSelectHtml(origValue, rowId);
    td.querySelector('.assignee-select').addEventListener('change', handleInlineChange);
  }

  let done = false;
  input.addEventListener('blur', () => { if (!done) { done = true; commit(); } });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); done = true; commit(); }
    if (e.key === 'Escape') { done = true; cancel(); }
  });
}

// ─── 그룹 판단 ───────────────────────────────────────────────────────────────

function getTicketGroup(ticket) {
  const s = ticket.status;
  if (s === '완료') return 'done';
  if (s === '보류' || s === 'N/A') return 'hold';
  return ticket.assignee === 'MVN' ? 'activeMVN' : 'activeWW';
}

// ─── 인라인 필드 즉시 수정 ────────────────────────────────────────────────────

async function handleInlineChange(e) {
  const el = e.target;
  const rowId = el.dataset.rowId;
  const field = el.dataset.field;

  if (field === 'assignee' && el.value === '__custom__') {
    activateCustomAssignee(el);
    return;
  }

  const value = el.type === 'checkbox' ? (el.checked ? 'OK' : '') : el.value;

  let ticket = null, currentGroup = null;
  for (const group of ['activeWW', 'activeMVN', 'done', 'hold']) {
    const found = allTickets[group].find(tk => tk.row_id === rowId);
    if (found) { ticket = found; currentGroup = group; break; }
  }
  if (!ticket) return;

  // ── 실시순서: 같은 그룹+버전 기준 중복 확인 + 연속된 번호만 cascade (Rule 4) ──
  if (field === 'priority') {
    const prevValue = String(ticket.priority ?? '');
    if (value === prevValue) return; // 변경 없음

    if (value !== '') {
      // 같은 그룹(WW/MVN) + 같은 버전 티켓만 대상
      const isMVN = ticket.assignee === 'MVN';
      const sameGroup = isMVN ? allTickets.activeMVN : allTickets.activeWW;
      const ticketVersionId = ticket.version_id || '';
      const sameScopeTickets = sameGroup.filter(tk => tk.version_id === ticketVersionId);

      const conflict = sameScopeTickets.find(tk => tk.row_id !== rowId && String(tk.priority) === value);

      if (conflict) {
        const msg = `${conflict.ticket_id} 티켓이 이미 ${value}순서로 배정되어 있습니다.\n확인하면 ${value}순서부터 연속된 항목들이 뒤로 한 칸씩 밀립니다.`;
        const ok = isCascadeSkippedToday() || await confirmCascade(msg);
        if (!ok) {
          el.value = prevValue;
          return;
        }
        // 연속된 번호만 밀기 (빈칸에서 중지)
        const changed = cascadeShift(sameScopeTickets, Number(value), rowId);
        changed.forEach(tk => updateTicket({ row_id: tk.row_id, priority: tk.priority }).catch(console.error));
      }
    }

    ticket.priority = value;
    renderAll();
    try { await updateTicket({ row_id: rowId, priority: value }); }
    catch (err) { alert('저장에 실패했습니다: ' + err.message); }
    return;
  }

  // ── 완료 → 재테스트: 원본 유지 + 복제 티켓 생성 (값 변경 전에 검사) ──────────
  if (field === 'status' && value === '재테스트' && ticket.status === '완료') {
    el.value = '완료'; // 셀렉트 원상복구
    const ok = confirm(`[${ticket.ticket_id}] 재테스트 항목을 새로 만들겠습니까?\n원본 완료 티켓은 그대로 유지됩니다.`);
    if (!ok) return;
    try {
      await addTicket({
        ticket_id:     ticket.ticket_id,
        title:         ticket.title,
        check_version: ticket.check_version,
        assignee:      ticket.assignee,
        priority:      '',
        status:        '재테스트',
        verdict:       '',
        check_content: ticket.check_content,
        note:          ticket.note,
        wjira_updated: '',
        file_urls:     '',
        retest_ref:    ticket.ticket_id,
        version_id:    ticket.version_id || ''
      });
      await loadTickets();
    } catch (err) {
      alert('복제에 실패했습니다: ' + err.message);
    }
    return;
  }

  ticket[field] = value;

  if (field === 'status' || field === 'assignee') {
    const newGroup = getTicketGroup(ticket);
    if (newGroup !== currentGroup) {
      // 비활성 그룹(완료/보류)으로 이동 시 실시순서 초기화
      const toInactive = newGroup === 'done' || newGroup === 'hold';
      if (toInactive) ticket.priority = '';

      allTickets[currentGroup] = allTickets[currentGroup].filter(tk => tk.row_id !== rowId);
      allTickets[newGroup].push(ticket);
      renderAll();
      if (toInactive) {
        userCollapsed.delete(newGroup);
      }
      try {
        const payload = { row_id: rowId, [field]: value };
        if (toInactive) payload.priority = '';
        await updateTicket(payload);
      } catch (err) {
        console.error('업데이트 실패:', err);
        alert('저장에 실패했습니다: ' + err.message);
      }
      return;
    }
  }

  if (field === 'status') {
    const cls = { '진행중': 'status-active', '진행전': 'status-pending', '재테스트': 'status-retest', '완료': 'status-done', '보류': 'status-hold', 'N/A': 'status-na' }[value] || '';
    el.className = `inline-select status-select ${cls}`.trimEnd();
  }
  if (field === 'verdict') {
    const cls = value === 'OK' ? 'verdict-ok' : value === 'NG' ? 'verdict-ng' : '';
    el.className = `inline-select verdict-select ${cls}`.trimEnd();
  }

  try {
    await updateTicket({ row_id: rowId, [field]: value });
  } catch (err) {
    console.error('업데이트 실패:', err);
    alert('저장에 실패했습니다: ' + err.message);
  }
}

// ─── 섹션 접기/펼치기 ─────────────────────────────────────────────────────────

function toggleSection(group) {
  const body = document.getElementById('section-' + group + '-body');
  const icon = document.getElementById('toggle-' + group);
  if (!body || !icon) return;
  const nowCollapsed = body.classList.toggle('collapsed');
  icon.textContent = nowCollapsed ? '▶' : '▼';
  if (nowCollapsed) {
    userCollapsed.add(group);
  } else {
    userCollapsed.delete(group);
  }
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
