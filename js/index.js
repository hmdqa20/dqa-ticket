// 수정: 2026-07-03 — WJIRA 컬럼 80→100px(물음표 잘림 해소), 헤더 필터 아이콘 교체(▼→깔때기)
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

const LOCK_EXPIRE_MS = 30 * 60 * 1000;
// 내가 방금 편집을 끝내고 돌아온 항목 — 서버가 unlock을 반영할 때까지 자물쇠 억제
let suppressLockRowId = sessionStorage.getItem('dqa_released_row') || null;
sessionStorage.removeItem('dqa_released_row');

// 표시용 잠금 판정: 30분 이내 잠금. 단, 내가 방금 푼 항목은 서버가 풀릴 때까지 억제.
function isLockedForDisplay(ticket) {
  const locked = !!ticket.locked_at &&
    (Date.now() - new Date(ticket.locked_at).getTime()) < LOCK_EXPIRE_MS;
  if (ticket.row_id === suppressLockRowId) {
    if (!locked) suppressLockRowId = null; // 서버가 해제 반영 → 억제 종료
    return false;
  }
  return locked;
}

const PRESET_ASSIGNEES = ['정기석', '박수완', '한국', 'MVN'];
const LEGACY_ASSIGNEES = ['박수원', '홍경두'];

document.addEventListener('DOMContentLoaded', async () => {
  applyTranslations();
  buildAllHeaders();

  // 마지막 선택 버전 복원 (없으면 ALL_VERSION으로 전체 로드 후 최신 버전으로 전환)
  currentVersionId = localStorage.getItem('dqa_current_version') || ALL_VERSION;

  await loadTickets();

  // localStorage 값이 없고 버전이 있으면 sort_order 최대(최신) 버전을 기본 탭으로 설정
  if (!localStorage.getItem('dqa_current_version') && versions.length > 0) {
    const latest = versions.reduce((a, b) => a.sort_order > b.sort_order ? a : b);
    currentVersionId = latest.version_id;
    const filterByVer = arr => arr.filter(tk => tk.version_id === latest.version_id);
    allTickets = {
      ...allTickets,
      activeWW:  filterByVer(allTickets.activeWW),
      activeMVN: filterByVer(allTickets.activeMVN),
      done:      filterByVer(allTickets.done),
      hold:      filterByVer(allTickets.hold),
    };
    renderSidebar();
    renderAll();
  }

  setupDragDrop(document.getElementById('tbody-activeWW'),  'activeWW');
  setupDragDrop(document.getElementById('tbody-activeMVN'), 'activeMVN');

  startAutoRefresh();  // 주기적 전체 갱신 (가드: 조작 중이면 건너뜀)
  setupTooltips();     // 클립/자물쇠 등 [data-tip] 요소 위쪽 커스텀 툴팁

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
    buildAllHeaders();
    populateDynamicFilters();
    renderAll();
  });
  // 필터 해제: 드롭다운에서 빈 항목 선택(value='') → 위 change 핸들러가 처리
});

// ─── 헤더 생성 ───────────────────────────────────────────────────────────────

// 컬럼 너비: 클립 | 티켓번호 | 이슈명(flex) | 확인버전 | 실시순서 | 담당자 | 진행상태 | 판정 | WJIRA
// 이슈명은 테이블 min-width(950px)에서 고정 컬럼 합(758px)을 뺀 나머지를 자동 배분 (≥192px 보장)
// WJIRA는 컬럼명+아이콘+물음표(?)가 들어가도록 100px
const COL_WIDTHS = ['24px', '110px', '', '110px', '70px', '110px', '120px', '70px', '100px', '44px'];
// 클립 | 티켓번호 | 이슈명(flex) | 확인버전 | 실시순서 | 담당자 | 진행상태 | 판정 | WJIRA | 핸들

// 헤더 필터 아이콘: 비활성=얇은 ▼(드롭다운 힌트), 활성=깔때기(필터 걸림 표시)
const CHEVRON_SVG = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;
const FUNNEL_SVG  = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M4.25 5.61C6.27 8.2 10 13 10 13v5c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-5s3.73-4.8 5.75-7.39c.51-.66.04-1.61-.79-1.61H5.04c-.83 0-1.3.95-.79 1.61z"/></svg>`;

// 필터 래퍼의 아이콘을 활성/비활성 상태에 맞게 교체
function setFilterIcon(wrapEl, active) {
  const ic = wrapEl && wrapEl.querySelector('.th-filter-icon');
  if (ic) ic.innerHTML = active ? FUNNEL_SVG : CHEVRON_SVG;
}

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

  // 컬럼명은 항상 유지. 필터 활성 여부는 아이콘 교체(▼→깔때기)+강조색으로 표시(높이 불변).
  // 필터 값은 select의 title 툴팁으로 확인, 해제는 드롭다운 빈 항목 선택.
  // iconHtml: 필터 텍스트 우측에 추가 아이콘 (th-filter-wrap 바깥 → select 오버레이 밖에 위치)
  const wrap = (key, label, inner, displayVal, iconHtml = '') => {
    const active = !!f[key];
    const titleVal = active ? escHtml(displayVal || f[key]) : '';
    const titleAttr = titleVal ? ` title="${escHtml(label)}: ${titleVal}"` : '';
    const filterWrap = `<span class="th-filter-wrap${active ? ' active' : ''}">` +
      `<span class="th-filter-label">${label}</span>` +
      `<span class="th-filter-icon">${active ? FUNNEL_SVG : CHEVRON_SVG}</span>` +
      `<select class="th-filter-select" data-filter-key="${key}"${titleAttr}>${inner}</select>` +
      `</span>`;
    // 아이콘이 있으면 필터 래퍼와 나란히 배치
    const topRow = iconHtml ? `<span class="th-row">${filterWrap}${iconHtml}</span>` : filterWrap;
    return `<span class="th-content">${topRow}</span>`;
  };

  return `
    <th></th>
    <th>${t('col_ticket_id')}</th>
    <th>${t('col_title')}</th>
    <th>${wrap('version', t('col_check_version'), `<option value=""></option>`)}</th>
    <th>${t('col_order')}</th>
    <th>${wrap('assignee', t('col_assignee'), `<option value=""></option>`)}</th>
    <th>${wrap('status', t('col_status'), `<option value=""></option>${statusOpts}`, f.status ? statusLabel(f.status) : '')}</th>
    <th>${wrap('verdict', t('col_verdict'), `<option value=""></option><option value="OK"${sel('verdict','OK')}>OK</option><option value="NG"${sel('verdict','NG')}>NG</option>`)}</th>
    <th>${wrap('wjira', 'WJIRA', `<option value=""></option><option value="OK"${sel('wjira','OK')}>기재완료</option><option value="none"${sel('wjira','none')}>미기재</option>`, f.wjira === 'OK' ? '기재완료' : f.wjira === 'none' ? '미기재' : '', '<span class="th-help-icon" title="WJIRA 결과 기재">?</span>')}</th>
    <th></th>
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
    syncFilterWrap(sel, t('col_assignee'), cur);
  });

  const versions = [...new Set(
    all.flatMap(tk => (tk.check_version || '').split('\n').map(v => v.trim()).filter(Boolean))
  )].sort();
  document.querySelectorAll('.th-filter-select[data-filter-key="version"]').forEach(sel => {
    const cur = activeFilters.version;
    sel.innerHTML = `<option value=""></option>` +
      versions.map(v => `<option value="${escHtml(v)}"${cur === v ? ' selected' : ''}>${escHtml(v)}</option>`).join('');
    syncFilterWrap(sel, t('col_check_version'), cur);
  });
}

// 동적 필터(담당자·확인버전) 래퍼의 라벨(항상 컬럼명)·활성 아이콘·툴팁 동기화
function syncFilterWrap(sel, label, cur) {
  const wrapEl = sel.closest('.th-filter-wrap');
  if (!wrapEl) return;
  const active = cur !== '';
  const labelEl = wrapEl.querySelector('.th-filter-label');
  if (labelEl) labelEl.textContent = label;   // 컬럼명 고정(값은 툴팁으로)
  wrapEl.classList.toggle('active', active);
  setFilterIcon(wrapEl, active);
  if (active) sel.title = `${label}: ${cur}`;
  else sel.removeAttribute('title');
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

// 티켓번호(XAX2-2667)의 끝 숫자를 추출 (정렬 2차 기준용)
function ticketNo(t) {
  const m = String(t.ticket_id || '').match(/(\d+)\s*$/);
  return m ? Number(m[1]) : Infinity;
}

function sortByPriority(tickets) {
  return [...tickets].sort((a, b) => {
    const pa = Number(a.priority) || Infinity;
    const pb = Number(b.priority) || Infinity;
    if (pa !== pb) return pa - pb;
    // 동순위(둘 다 빈칸이면 Infinity 동률) → 티켓번호 오름차순
    return ticketNo(a) - ticketNo(b);
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
    tbody.innerHTML = `<tr class="no-data"><td colspan="10">${t('no_tickets')}</td></tr>`;
    return;
  }

  tbody.innerHTML = tickets.map(ticket => buildRow(ticket, dimmed, group)).join('');

  tbody.querySelectorAll('.navigate-cell').forEach(td => {
    td.addEventListener('click', () => {
      const rowId = td.closest('tr').dataset.rowId;
      if (!rowId) return;
      // 잠긴 항목은 상세로 가지 않고 즉시 팝업 (GAS 재조회 없이 캐시로 판단)
      const ticket = allTicketsFlat().find(tk => tk.row_id === rowId);
      if (ticket && isLockedForDisplay(ticket)) {
        alert('다른 사용자가 편집 중인 항목입니다.\n편집이 완료된 후 다시 시도해 주세요.');
        return;
      }
      location.href = 'detail.html?id=' + rowId;
    });
  });

  tbody.querySelectorAll('.inline-select, .wjira-checkbox').forEach(el => {
    el.addEventListener('change', handleInlineChange);
  });

  // 활성 그룹만 드래그 핸들 활성화
  if (group === 'activeWW' || group === 'activeMVN') {
    setupDragDrop(tbody, group);
  }
}

function buildRow(ticket, dimmed, group) {
  const pri = String(ticket.priority ?? '');
  const orderClass = pri === '1' ? 'order-1' : pri === '2' ? 'order-2' : pri === '3' ? 'order-3' : '';
  const statusClass = { '진행중': 'status-active', '진행전': 'status-pending', '재테스트': 'status-retest', '완료': 'status-done', '보류': 'status-hold', 'N/A': 'status-na' }[ticket.status] || '';
  const verdictClass = ticket.verdict === 'OK' ? 'verdict-ok' : ticket.verdict === 'NG' ? 'verdict-ng' : '';
  const hasFiles = ticket.file_urls && ticket.file_urls.trim();
  const isActive = ['진행중', '진행전', '재테스트'].includes(ticket.status);
  const locked = isLockedForDisplay(ticket); // 다른 사용자가 편집 중 → 인라인 변경 차단
  const dis = locked ? ' disabled' : '';

  // 활성 행: 실시순서 드롭다운(+ 핸들 드래그로도 변경 가능), 완료/보류: — 표시
  const activeCount = allTickets.activeWW.length + allTickets.activeMVN.length;
  const maxOrder = Math.max(5, activeCount);
  const orderCell = isActive
    ? (() => {
        const opts = ['', ...Array.from({length: maxOrder}, (_, i) => String(i + 1))].map(v =>
          `<option value="${v}"${pri === v ? ' selected' : ''}>${v || '—'}</option>`
        ).join('');
        return `<select class="inline-select order-select ${orderClass}" data-field="priority" data-row-id="${escHtml(ticket.row_id)}"${dis}>${opts}</select>`;
      })()
    : `<span class="order-dash">—</span>`;

  // row-active(진행중 강조) + draggable-row(DnD 대상) + dimmed + locked-row(편집중 잠금) 조합
  const rowClass = [
    isActive && !locked ? 'draggable-row' : '',
    locked ? 'locked-row' : '',
    dimmed ? 'dimmed' : (ticket.status === '진행중' ? 'row-active' : '')
  ].filter(Boolean).join(' ');

  const statusOptions = ['진행중', '진행전', '재테스트', '완료', '보류', 'N/A'].map(v =>
    `<option value="${v}"${ticket.status === v ? ' selected' : ''}>${statusLabel(v)}</option>`
  ).join('');

  const verdictOptions = ['', 'OK', 'NG'].map(v =>
    `<option value="${v}"${ticket.verdict === v ? ' selected' : ''}>${v || '—'}</option>`
  ).join('');

  const wjiraChecked = ticket.wjira_updated === 'OK' ? ' checked' : '';

  // 첨부 파일 대표 이름(맨 위 1개) — 클립 툴팁용. 형식 "이름|크기|URL"
  const firstFileName = hasFiles ? (() => {
    const first = ticket.file_urls.split(',')[0].trim();
    const pipe = first.indexOf('|');
    return pipe > 0 ? first.slice(0, pipe) : first;
  })() : '';

  const versionHtml = (ticket.check_version || '').split('\n')
    .map(v => v.trim()).filter(Boolean)
    .map(v => `<div class="version-line">${escHtml(v)}</div>`).join('');

  return `
    <tr data-row-id="${escHtml(ticket.row_id)}" data-group="${escHtml(group || '')}" class="${rowClass}">
      <td class="clip-cell"${hasFiles ? ` data-tip="첨부 파일 - ${escHtml(firstFileName)}"` : ''}>${hasFiles ? `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>` : ''}</td>
      <td class="ticket-id-cell">${isLockedForDisplay(ticket) ? '<span class="lock-icon" data-tip="다른 사용자가 편집중입니다.">🔒</span>' : ''}<a href="https://wjira.humaxdigital.com/browse/${escHtml(ticket.ticket_id)}" target="_blank" class="ticket-link">${escHtml(ticket.ticket_id)}</a></td>
      <td class="title-cell navigate-cell"${ticket.title ? ` data-tip="${escHtml(ticket.title)}"` : ''}>${escHtml(ticket.title)}</td>
      <td class="navigate-cell version-cell">${versionHtml}</td>
      <td>${orderCell}</td>
      <td class="assignee-cell">${buildAssigneeSelectHtml(ticket.assignee || '', ticket.row_id, locked)}</td>
      <td class="status-cell"><select class="inline-select status-select ${statusClass}" data-field="status" data-row-id="${escHtml(ticket.row_id)}"${dis}>${statusOptions}</select></td>
      <td><select class="inline-select verdict-select ${verdictClass}" data-field="verdict" data-row-id="${escHtml(ticket.row_id)}"${dis}>${verdictOptions}</select></td>
      <td class="wjira-cell"><input type="checkbox" class="wjira-checkbox" data-field="wjira_updated" data-row-id="${escHtml(ticket.row_id)}"${wjiraChecked}${dis}></td>
      <td class="drag-handle-cell">${isActive ? `<span class="drag-handle" title="드래그하여 순서 변경">⠿</span>` : ''}</td>
    </tr>`;
}

function updateCounts() {
  ['activeWW', 'activeMVN', 'done', 'hold'].forEach(group => {
    const el = document.getElementById('count-' + group);
    if (el) el.textContent = filterTickets(allTickets[group]).length;
  });
}

// ─── 담당자 셀 ────────────────────────────────────────────────────────────────

function buildAssigneeSelectHtml(av, rowId, locked = false) {
  const isPreset = PRESET_ASSIGNEES.includes(av);
  const isLegacy = LEGACY_ASSIGNEES.includes(av);
  const showCustom = av !== '' && !isPreset && !isLegacy;
  let opts = `<option value=""></option>`;
  opts += PRESET_ASSIGNEES.map(v =>
    `<option value="${escHtml(v)}"${av === v ? ' selected' : ''}>${escHtml(v)}</option>`
  ).join('');
  if (showCustom) opts += `<option value="${escHtml(av)}" selected>${escHtml(av)}</option>`;
  opts += `<option value="__custom__">직접입력...</option>`;
  return `<select class="inline-select assignee-select" data-field="assignee" data-row-id="${escHtml(rowId)}"${locked ? ' disabled' : ''}>${opts}</select>`;
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
      lastEditAt = Date.now();   // 자동 갱신 레이스 방지
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

// cascadeShift: fromNum 번호부터 연속된 숫자만 뒤로 한 칸씩 밀기
// - 빈칸(-) 만나면 중지 (빈칸은 버퍼, 밀지 않음)
// - targetRowId (현재 변경 중인 티켓)는 제외
function cascadeShift(tickets, fromNum, targetRowId) {
  const changed = [];
  let next = fromNum;
  const sorted = tickets
    .filter(tk => tk.row_id !== targetRowId && String(tk.priority) !== '')
    .sort((a, b) => Number(a.priority) - Number(b.priority));

  for (const tk of sorted) {
    const p = Number(tk.priority);
    if (p === next) {
      tk.priority = String(p + 1);
      changed.push(tk);
      next++;
    } else if (p > next) {
      break; // 연속 끊김 → 중지
    }
  }
  return changed;
}

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

  // 안전망: 다른 사용자가 편집 중인 항목은 인라인 변경 차단 (disabled 우회/레이스 대비)
  if (isLockedForDisplay(ticket)) {
    alert('다른 사용자가 편집 중인 항목입니다.\n편집이 완료된 후 다시 시도해 주세요.');
    renderAll();
    return;
  }

  lastEditAt = Date.now();   // 자동 갱신이 방금 편집을 덮어쓰지 않도록 잠시 지연

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
      // 그룹 이동 시 실시순서 초기화 (그룹별 독립 관리: WW↔MVN 이동 시 중복 방지)
      ticket.priority = '';

      const toInactive = newGroup === 'done' || newGroup === 'hold';
      allTickets[currentGroup] = allTickets[currentGroup].filter(tk => tk.row_id !== rowId);
      allTickets[newGroup].push(ticket);
      renderAll();
      if (toInactive) {
        userCollapsed.delete(newGroup);
      }
      try {
        await updateTicket({ row_id: rowId, [field]: value, priority: '' });
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
    const tr = el.closest('tr');
    if (tr) {
      if (value === '진행중') tr.classList.add('row-active');
      else tr.classList.remove('row-active');
    }
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

// ─── 드래그앤드롭으로 실시순서 변경 ──────────────────────────────────────────────

function setupDragDrop(tbody, group) {
  let dragRow = null;

  // 핸들에 mousedown 했을 때만 해당 행을 draggable로 설정
  // (dragstart의 e.target은 draggable 요소인 tr 자체라 핸들 판별이 불가능하므로 여기서 결정)
  tbody.addEventListener('mousedown', e => {
    const row = e.target.closest('tr.draggable-row');
    if (!row) return;
    row.draggable = !!e.target.closest('.drag-handle');
  });

  tbody.addEventListener('dragstart', e => {
    const row = e.target.closest('tr.draggable-row');
    if (!row || !row.draggable) { e.preventDefault(); return; }
    dragRow = row;
    isDragging = true;            // 자동 갱신 가드
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', row.dataset.rowId);
    requestAnimationFrame(() => { if (dragRow) dragRow.classList.add('dragging'); });
  });

  // 드롭 위치 인디케이터(녹색 줄) 제거
  const clearIndicators = () => {
    tbody.querySelectorAll('.drop-above, .drop-below').forEach(el =>
      el.classList.remove('drop-above', 'drop-below'));
  };

  tbody.addEventListener('dragover', e => {
    e.preventDefault();
    if (!dragRow) return;
    e.dataTransfer.dropEffect = 'move';
    const row = e.target.closest('tr.draggable-row');
    clearIndicators();
    if (!row || row === dragRow) return;
    const rect = row.getBoundingClientRect();
    const isBefore = e.clientY < rect.top + rect.height / 2;
    row.classList.add(isBefore ? 'drop-above' : 'drop-below');
  });

  tbody.addEventListener('dragenter', e => e.preventDefault());

  tbody.addEventListener('dragleave', e => {
    // tbody 영역을 완전히 벗어날 때만 인디케이터 정리
    if (!tbody.contains(e.relatedTarget)) clearIndicators();
  });

  tbody.addEventListener('drop', e => {
    e.preventDefault();
    if (!dragRow) return;
    const row = e.target.closest('tr.draggable-row');
    if (row && row !== dragRow) {
      const rect = row.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) row.before(dragRow);
      else row.after(dragRow);
    }
    clearIndicators();
  });

  tbody.addEventListener('dragend', async () => {
    clearIndicators();
    isDragging = false;          // 자동 갱신 가드 해제
    lastEditAt = Date.now();     // 저장 레이스 방지 (재정렬 직후 갱신 지연)
    if (!dragRow) return;
    dragRow.classList.remove('dragging');
    dragRow.draggable = false; // 드래그 종료 후 draggable 해제

    const draggedId = dragRow.dataset.rowId;
    dragRow = null;

    // DOM 순서 (드롭 반영됨). allTickets는 아직 이전 priority 상태 → 영역 판정에 사용.
    const rows = [...tbody.querySelectorAll('tr.draggable-row[data-row-id]')];
    const getT = id => allTickets[group].find(tk => tk.row_id === id);
    const wasNumbered = t => t && String(t.priority) !== '';   // 드래그 전 번호 보유 여부

    const dragIdx = rows.findIndex(r => r.dataset.rowId === draggedId);
    const draggedT = getT(draggedId);
    if (dragIdx === -1 || !draggedT) { renderAll(); return; }

    // 드롭 위치의 앞/뒤 이웃으로 번호영역 vs 빈칸영역 판정
    // (번호 항목은 항상 빈칸 항목보다 위에 정렬되므로 이웃만 봐도 충분)
    const nextT = dragIdx + 1 < rows.length ? getT(rows[dragIdx + 1].dataset.rowId) : null;
    const prevT = dragIdx - 1 >= 0 ? getT(rows[dragIdx - 1].dataset.rowId) : null;
    // 번호영역: 바로 뒤가 번호 항목 || (맨 끝인데 바로 앞이 번호 항목 = 빈칸 없이 맨 끝 재배치)
    const inNumberedZone = wasNumbered(nextT) || (nextT === null && wasNumbered(prevT));

    const updates = [];
    const setPri = (t, id, val) => {
      const v = String(val);
      if (String(t.priority ?? '') !== v) {
        t.priority = v;
        updates.push({ row_id: id, priority: v });
      }
    };

    if (inNumberedZone) {
      // 번호영역: 드래그 항목 + 기존 번호 항목들을 DOM 순서로 1..n 재번호. 빈칸 항목은 그대로.
      let n = 0;
      rows.forEach(r => {
        const id = r.dataset.rowId;
        const t = getT(id);
        if (!t) return;
        if (id === draggedId || wasNumbered(t)) {
          setPri(t, id, ++n);
        }
        // 빈칸 항목(빈칸→빈칸 유지)은 건드리지 않음
      });
    } else {
      // 빈칸영역: 드래그 항목만 번호 삭제(원래 자리는 gap으로 유지), 나머지는 그대로.
      setPri(draggedT, draggedId, '');
    }

    renderAll(); // 재정렬 + priority 숫자 칩 갱신

    // 변경된 항목만 GAS에 저장
    if (updates.length) {
      await Promise.all(updates.map(u => updateTicket(u).catch(console.error)));
    }
  });
}

// ─── 자동 전체 갱신 (가드 붙은 주기적 새로고침) ───────────────────────────────
// 매 주기 전체 데이터를 받아 재렌더(재정렬·재그룹·잠금아이콘·컨트롤 포함).
// 단, 사용자가 조작 중이면 그 주기를 건너뛰어 행 점프/드롭다운 닫힘을 방지.

const REFRESH_MS = 20000;          // 20초 주기 (LOCK_EXPIRE_MS는 상단에 정의됨)
let refreshTimer = null;
let isDragging = false;            // 드래그 진행 중 (setupDragDrop에서 토글)
let lastEditAt = 0;                // 마지막 인라인 편집 시각 (저장 레이스 방지)

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(refreshList, REFRESH_MS);
  // 탭이 다시 활성화되면 즉시 한 번 갱신
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshList();
  });
}

// 사용자가 조작 중인지 — 이때는 갱신을 건너뜀
function isUserBusy() {
  if (isDragging) return true;
  if (Date.now() - lastEditAt < 4000) return true;          // 방금 편집 후 4초
  const ae = document.activeElement;                         // 열린 드롭다운/편집중이면 포커스 보유
  if (ae && ae.closest && ae.closest('.ticket-table')) return true;
  return false;
}

async function refreshList() {
  if (document.hidden) return;     // 비활성 탭에서는 GAS 호출 생략
  if (isUserBusy()) return;        // 조작 중이면 이번 주기 건너뜀

  let data;
  try {
    data = await getTickets(currentVersionId === ALL_VERSION ? '' : currentVersionId);
  } catch (_) {
    return;                         // 실패는 조용히 무시 (다음 주기에 재시도)
  }

  if (isUserBusy()) return;        // await 사이 조작 시작했을 수 있으니 재확인

  allTickets = data;
  versions = data.versions || versions;
  populateDynamicFilters();
  renderAll();                      // buildRow가 잠금 아이콘·disabled·재정렬 모두 처리
}

// ─── 커스텀 툴팁 ([data-tip] 요소 위쪽 표시, table-scroll 클리핑 회피) ───────────
// native title은 커서 아래에만 떠서 글씨를 가림 → body에 붙인 div로 요소 위쪽에 표시.

function setupTooltips() {
  const tip = document.createElement('div');
  tip.className = 'app-tooltip';
  document.body.appendChild(tip);

  const show = el => {
    tip.textContent = el.getAttribute('data-tip');
    tip.classList.add('show');
    const r  = el.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    let left = r.left + r.width / 2 - tr.width / 2;
    let top  = r.top - tr.height - 8;               // 요소 위쪽
    if (top < 4) top = r.bottom + 8;                // 위 공간 없으면 아래로
    left = Math.max(4, Math.min(left, window.innerWidth - tr.width - 4));
    tip.style.left = left + 'px';
    tip.style.top  = top + 'px';
  };
  const hide = () => tip.classList.remove('show');

  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-tip]');
    if (el) show(el);
  });
  document.addEventListener('mouseout', e => {
    const el = e.target.closest('[data-tip]');
    if (el && !(e.relatedTarget && el.contains(e.relatedTarget))) hide();
  });
  // 스크롤/이동 시 위치가 어긋나지 않도록 숨김
  window.addEventListener('scroll', hide, true);
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
