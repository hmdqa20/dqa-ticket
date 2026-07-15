// 티켓 데이터 캐시
let allTickets = { activeWW: [], activeMVN: [], done: [], hold: [] };
let searchQuery = '';
let activeFilters = { assignee: '', status: '', verdict: '', version: '', wjira: '' };
const userCollapsed = new Set(); // 사용자가 직접 접은 섹션
const ALL_SECTIONS = ['activeWW', 'activeMVN', 'done', 'hold'];
const SECTION_STATE_KEY = 'dqa_section_collapsed';

function saveSectionStates() {
  const state = {};
  for (const g of ALL_SECTIONS) state[g] = userCollapsed.has(g);
  localStorage.setItem(SECTION_STATE_KEY, JSON.stringify(state));
}

function loadSectionStates() {
  try {
    const raw = localStorage.getItem(SECTION_STATE_KEY);
    if (!raw) return;
    const state = JSON.parse(raw);
    for (const [g, collapsed] of Object.entries(state)) {
      if (collapsed) userCollapsed.add(g); else userCollapsed.delete(g);
    }
  } catch (_) {}
}

function applyCollapsedStates() {
  for (const g of ALL_SECTIONS) {
    const body = document.getElementById('section-' + g + '-body');
    const icon = document.getElementById('toggle-' + g);
    if (!body || !icon) continue;
    if (userCollapsed.has(g)) { body.classList.add('collapsed'); icon.textContent = '▶'; }
  }
}

// "전체" 가상 탭 식별자
const ALL_VERSION = '__ALL__';

// 버전 탭 상태
let versions = [];                  // [{version_id, version_name, status, ...}]
let currentVersionId = ALL_VERSION; // 현재 선택된 버전 (ALL_VERSION=전체)

// 선택 모드 (버전 일괄이동) — 활성 그룹(activeWW/activeMVN) 각각 완전 독립 운영
const SELECTABLE_GROUPS = ['activeWW', 'activeMVN'];
let selectionMode = { activeWW: false, activeMVN: false };
let selectedRowIds = { activeWW: new Set(), activeMVN: new Set() };

const LOCK_EXPIRE_MS = 5 * 60 * 1000;
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

// 원문에 일본어 문자가 있는지 판정 (Code.gs의 JP_RUN_RE와 동일 문자 범위, 존재 여부만 확인)
const JP_CHAR_RE = /[぀-ゟ゠-ヿ一-龯　-〿㐀-䶿豈-﫿]/;

document.addEventListener('DOMContentLoaded', async () => {
  setupSidebarToggle();  // 첫 페인트 전에 접힘 상태부터 적용 (펼쳐진 사이드바가 깜빡이지 않도록 최우선)
  applyTranslations();
  SELECTABLE_GROUPS.forEach(g => syncSelectionModeButtonText(g));
  buildAllHeaders();
  loadSectionStates();
  applyCollapsedStates();

  // 언어 전환 시 API 재호출 없이 현재 데이터로 재렌더링
  onLangChange(() => {
    applyTranslations();
    SELECTABLE_GROUPS.forEach(g => syncSelectionModeButtonText(g));
    buildAllHeaders();
    renderAll();
  });

  // 마지막 선택 버전 복원 (없으면 ALL_VERSION으로 전체 로드 후 최신 버전으로 전환)
  currentVersionId = localStorage.getItem('dqa_current_version') || ALL_VERSION;

  await loadTickets();

  // localStorage 값이 없고 버전이 있으면 리스트 최상단 버전을 기본 탭으로 설정
  if (!localStorage.getItem('dqa_current_version') && versions.length > 0) {
    const latest = versions[0];
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
  setupStickyScrollBars();
  setupScrollHints(); // [실험적 기능]

  startAutoRefresh();  // 주기적 전체 갱신 (가드: 조작 중이면 건너뜀)
  setupTooltips();     // 클립/자물쇠 등 [data-tip] 요소 위쪽 커스텀 툴팁
  setupOrigTitlePopover(); // 번역된 이슈명 ⓘ → 원문 팝오버

  document.getElementById('btn-new').addEventListener('click', () => {
    stopAutoRefresh();
    const vid = currentVersionId && currentVersionId !== ALL_VERSION ? '?version_id=' + encodeURIComponent(currentVersionId) : '';
    location.href = 'detail.html' + vid;
  });

  setupBulkSelectionUI();

  setupVersionSidebar();


  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderAll();
  });

  setupMobileSearch();

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

// 컬럼 너비: 클립 | 티켓번호 | [i] | 이슈명(flex) | 확인버전 | 실시순서 | 담당자 | 진행상태 | 판정 | WJIRA
// 이슈명은 테이블 min-width(944px)에서 고정 컬럼 합(762px)을 뺀 나머지를 자동 배분 (≥182px 보장)
// WJIRA는 컬럼명+아이콘+물음표(?)가 들어가도록 100px
// 티켓번호 76px
const COL_WIDTHS = ['24px', '76px', '30px', '', '110px', '70px', '110px', '120px', '70px', '100px', '44px'];
// 클립 | 티켓번호 | [i] | 이슈명(flex) | 확인버전 | 실시순서 | 담당자 | 진행상태 | 판정 | WJIRA | 핸들

// 헤더 필터 아이콘: 비활성=얇은 ▼(드롭다운 힌트), 활성=깔때기(필터 걸림 표시)
const CHEVRON_SVG = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;
const FUNNEL_SVG  = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M4.25 5.61C6.27 8.2 10 13 10 13v5c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-5s3.73-4.8 5.75-7.39c.51-.66.04-1.61-.79-1.61H5.04c-.83 0-1.3.95-.79 1.61z"/></svg>`;
// 드래그 핸들: 가로선 3개(hamburger/grip) — 글리프(⠿)보다 또렷하고 폰트에 무관하게 일관 렌더링
const GRIP_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>`;
// 사이드바 "전체 티켓" 탭 아이콘 (목록/리스트)
const LIST_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;
// "버전 관리" 버튼 아이콘 (태그 — 버전/릴리스 관리를 연상시키는 아이콘)
const TAG_SVG = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3H4a1 1 0 0 0-1 1v5.59a2 2 0 0 0 .59 1.41l9.58 9.59a2 2 0 0 0 2.83 0l4.59-4.59a2 2 0 0 0 0-2.83z"/><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none"/></svg>`;
// 잠긴(다른 사용자가 편집 중) 티켓 표시 아이콘 — "진입 불가"가 아니라 "편집 중이지만 열람 가능"이라는
// 뉘앙스를 주기 위해 자물쇠 대신 연필(편집 중) 아이콘 사용. 클래스명(.lock-icon)은 그대로 유지.
const PENCIL_SVG = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#b45309" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;

// 필터 래퍼의 아이콘을 활성/비활성 상태에 맞게 교체
function setFilterIcon(wrapEl, active) {
  const ic = wrapEl && wrapEl.querySelector('.th-filter-icon');
  if (ic) ic.innerHTML = active ? FUNNEL_SVG : CHEVRON_SVG;
}

function buildAllHeaders() {
  [['ww', 'active', 'activeWW'], ['mvn', 'active', 'activeMVN'], ['done', 'done', 'done'], ['hold', 'hold', 'hold']].forEach(([id, type, groupKey]) => {
    const tr = document.getElementById('thead-' + id);
    if (!tr) return;
    tr.innerHTML = buildHeaderHtml(type, groupKey);
    const selAll = tr.querySelector('.select-all-checkbox');
    if (selAll) selAll.addEventListener('change', handleSelectAllChange);
  });
  // colgroup에 고정 너비 주입
  document.querySelectorAll('colgroup.ticket-cols').forEach(cg => {
    cg.innerHTML = COL_WIDTHS.map(w => `<col${w ? ` style="width:${w}"` : ''}>`).join('');
  });
}

const STATUS_LABEL_KEY = { '진행중':'status_active', '진행전':'status_pending', '재테스트':'status_retest', '완료':'status_done_opt', '보류':'status_hold_opt', 'N/A':'status_na' };
function statusLabel(v) { return t(STATUS_LABEL_KEY[v] || v); }

function buildHeaderHtml(sectionType = 'active', groupKey = '') {
  const f = activeFilters;
  const firstTh = (SELECTABLE_GROUPS.includes(groupKey) && selectionMode[groupKey])
    ? `<th class="select-all-th"><input type="checkbox" class="select-all-checkbox" data-group="${groupKey}"></th>`
    : `<th></th>`;
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

  // 필터 첫 항목: 선택 시 필터 해제(전체 보기)
  const allOpt = `<option value="">${t('filter_all')}</option>`;

  return `
    ${firstTh}
    <th>${t('col_ticket_id')}</th>
    <th class="orig-icon-col"></th>
    <th>${t('col_title')}</th>
    <th>${wrap('version', t('col_check_version'), allOpt)}</th>
    <th>${t('col_order')}</th>
    <th>${wrap('assignee', t('col_assignee'), allOpt)}</th>
    <th>${wrap('status', t('col_status'), `${allOpt}${statusOpts}`, f.status ? statusLabel(f.status) : '')}</th>
    <th>${wrap('verdict', t('col_verdict'), `${allOpt}<option value="OK"${sel('verdict','OK')}>OK</option><option value="NG"${sel('verdict','NG')}>NG</option>`)}</th>
    <th>${wrap('wjira', 'WJIRA', `${allOpt}<option value="OK"${sel('wjira','OK')}>기재완료</option><option value="none"${sel('wjira','none')}>미기재</option>`, f.wjira === 'OK' ? '기재완료' : f.wjira === 'none' ? '미기재' : '', '<span class="th-help-icon" data-tip="WJIRA 결과 기재">?</span>')}</th>
    <th></th>
  `;
}

// ─── 데이터 로드 ──────────────────────────────────────────────────────────────

async function loadTickets() {
  const vid = currentVersionId === ALL_VERSION ? '' : currentVersionId;

  // 캐시 우선 렌더링(stale-while-revalidate): 직전에 받아둔 데이터가 있으면 즉시 그려서
  // GAS 콜드스타트(수 초)를 기다리지 않게 하고, 최신 데이터는 백그라운드로 받아 갈아끼운다.
  // 캐시가 있을 땐 fetch를 await 하지 않고 즉시 반환 — 이 함수는 DOMContentLoaded에서
  // await되므로, 기다리면 뒤에 배선되는 버튼/검색/드래그 리스너들이 콜드스타트 내내 죽어있게 됨.
  const cached = loadTicketsCache(vid);
  showError(false);
  if (cached) {
    allTickets = cached;
    versions = cached.versions || [];
    renderSidebar();
    populateDynamicFilters();
    renderAll();
    showLoading(false);
    fetchFreshList(vid, true);   // 백그라운드 — await 금지
    return;
  }
  showLoading(true);
  await fetchFreshList(vid, false);
}

async function fetchFreshList(vid, hadCache) {
  try {
    // 1차 시도 실패 시 RETRY_DELAY_MS 대기 후 1회 자동 재시도
    // 로딩 인디케이터는 재시도 동안 계속 표시 (finally에서만 숨김)
    let data;
    try {
      data = await getTickets(vid);
    } catch (firstErr) {
      console.warn('[loadTickets] 1차 실패, 재시도 중...', firstErr.message);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      data = await getTickets(vid);  // 실패 시 throw → outer catch
    }

    saveTicketsCache(vid, data);

    // 응답 대기 중 사용자가 다른 버전 탭으로 전환했으면 이 응답으로 화면을 덮지 않음
    const currentVid = currentVersionId === ALL_VERSION ? '' : currentVersionId;
    if (vid !== currentVid) return;

    // 캐시로 이미 그린 상태에서 사용자가 조작 중이면 이번 갱신은 건너뜀
    // (드롭다운 닫힘/행 점프 방지 — 20초 자동 갱신이 곧 다시 동기화함)
    if (hadCache && isUserBusy()) return;

    allTickets = data;
    versions = allTickets.versions || [];
    // 저장된 선택 버전이 더 이상 존재하지 않으면 전체로 복귀
    if (currentVersionId !== ALL_VERSION && !versions.some(v => v.version_id === currentVersionId)) {
      currentVersionId = ALL_VERSION;
    }
    renderSidebar();
    populateDynamicFilters();
    renderAll();
  } catch (err) {
    // 캐시로 이미 화면을 그렸다면 에러 배너 대신 조용히 넘어감 (다음 자동 갱신에서 재시도)
    if (!hadCache) showError(true, err.message);
  } finally {
    showLoading(false);
  }
}

// ─── 버전 사이드탭 ────────────────────────────────────────────────────────────

function renderSidebar() {
  const list = document.getElementById('version-list');
  if (!list) return;

  // "전체 티켓"은 이제 상단 고정 버튼(정적 마크업) — active 상태만 갱신
  const allBtn = document.getElementById('btn-all-tickets');
  if (allBtn) allBtn.classList.toggle('active', currentVersionId === ALL_VERSION);

  // 버전 목록만 스크롤 영역에 렌더링
  const html = versions.map(v => {
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
  // 버전 탭 전환 시 그룹별 선택 목록은 초기화 (선택 모드 자체는 유지)
  SELECTABLE_GROUPS.forEach(group => {
    if (selectionMode[group]) { selectedRowIds[group].clear(); updateBulkActionBar(group); }
  });
  renderSidebar();
  await loadTickets();
}

function setupVersionSidebar() {
  // 새 버전 추가 버튼은 onclick으로 versions.html 이동 처리 — 아이콘만 주입
  const addVersionIcon = document.getElementById('btn-add-version-icon');
  if (addVersionIcon) addVersionIcon.innerHTML = TAG_SVG;

  // "전체 티켓"은 상단 고정 정적 버튼 — 아이콘 주입 + 클릭 리스너는 최초 1회만 연결
  const listIcon = document.getElementById('version-all-icon');
  if (listIcon) listIcon.innerHTML = LIST_SVG;
  const allBtn = document.getElementById('btn-all-tickets');
  if (allBtn) allBtn.addEventListener('click', () => switchVersion(ALL_VERSION));
}

// ─── 사이드바 접기/펼치기 ────────────────────────────────────────────────────
// body.sidebar-collapsed 클래스로 제어 (CSS: .version-sidebar width 0 + 토글 꺾쇠 회전).
// 화면 폭 제한 없이 항상 토글 가능. 상태는 localStorage에 저장해 새로고침에도 유지되고,
// 저장값이 없는 첫 진입 때만 뷰포트 폭(768px 이하=접힘)으로 초기 상태를 정한다.

const SIDEBAR_COLLAPSED_KEY = 'dqa_sidebar_collapsed';

function setupSidebarToggle() {
  const btn = document.getElementById('btn-sidebar-toggle');
  if (!btn) return;

  const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
  const collapsed = saved !== null ? saved === '1' : window.innerWidth <= 768;
  document.body.classList.toggle('sidebar-collapsed', collapsed);

  btn.addEventListener('click', () => {
    const nowCollapsed = document.body.classList.toggle('sidebar-collapsed');
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, nowCollapsed ? '1' : '0');
  });
}

// ─── 선택 모드 / 버전 일괄이동 (DQA/MVN 완전 독립) ────────────────────────────
// 완료/보류 그룹, 잠긴 행은 대상에서 제외. 담당자 그룹(WW/MVN) 자체는 바꾸지 않고
// 같은 그룹 내에서 버전만 이동 + 대상 버전 내 max+1부터 순차 실시순서 재배정.
// 각 그룹은 자기 헤더에 내장된 선택모드 버튼/액션바만 갖고, 상태(selectionMode/selectedRowIds)도
// 그룹별로 독립 — 한쪽에서 선택모드를 켜도 다른 그룹은 전혀 영향받지 않는다.

function syncSelectionModeButtonText(group) {
  const btn = document.getElementById(`btn-select-mode-${group}`);
  if (btn) btn.textContent = selectionMode[group] ? t('btn_select_mode_active') : t('btn_select_mode');
}

function setupBulkSelectionUI() {
  SELECTABLE_GROUPS.forEach(group => {
    document.getElementById(`btn-select-mode-${group}`).addEventListener('click', (e) => {
      e.stopPropagation(); // 섹션 헤더 접기/펼치기 클릭으로 전파 방지
      toggleSelectionMode(group);
    });
    document.getElementById(`btn-bulk-move-${group}`).addEventListener('click', (e) => {
      e.stopPropagation();
      handleBulkMove(group);
    });
    // 헤더 영역 내 다른 조작(드롭다운 클릭 등)도 섹션 접기로 전파되지 않도록 컨테이너 단위 차단
    const actions = document.querySelector(`.section-header-actions[data-group="${group}"]`);
    if (actions) actions.addEventListener('click', e => e.stopPropagation());
  });
}

function toggleSelectionMode(group) {
  selectionMode[group] = !selectionMode[group];
  if (!selectionMode[group]) selectedRowIds[group].clear();

  document.getElementById(`btn-select-mode-${group}`).classList.toggle('active', selectionMode[group]);
  document.getElementById(`bulk-action-bar-${group}`).classList.toggle('open', selectionMode[group]);
  syncSelectionModeButtonText(group);

  if (selectionMode[group]) populateBulkTargetVersions(group);

  buildAllHeaders();
  renderAll();
  updateBulkActionBar(group);
}

function populateBulkTargetVersions(group) {
  const sel = document.getElementById(`bulk-target-version-${group}`);
  if (!sel) return;
  sel.innerHTML = `<option value="">${t('bulk_target_placeholder')}</option>` +
    versions.map(v => `<option value="${escHtml(v.version_id)}">${escHtml(v.version_name)}</option>`).join('');
}

function updateBulkActionBar(group) {
  const countEl = document.getElementById(`bulk-selected-count-${group}`);
  const moveBtn = document.getElementById(`btn-bulk-move-${group}`);
  if (countEl) countEl.innerHTML = `<span class="bulk-count-num">${selectedRowIds[group].size}</span>${t('unit_selected')}`;
  if (moveBtn) moveBtn.disabled = selectedRowIds[group].size === 0;
}

function handleSelectAllChange(e) {
  const group = e.target.dataset.group;
  if (!group || !selectedRowIds[group]) return;
  const checked = e.target.checked;
  document.querySelectorAll(`#tbody-${group} .row-select-checkbox`).forEach(cb => {
    cb.checked = checked;
    if (checked) selectedRowIds[group].add(cb.dataset.rowId);
    else selectedRowIds[group].delete(cb.dataset.rowId);
  });
  updateBulkActionBar(group);
}

async function handleBulkMove(group) {
  const targetVersionId = document.getElementById(`bulk-target-version-${group}`).value;
  if (!targetVersionId) { alert('이동할 버전을 선택하세요.'); return; }

  const selectedTickets = [...selectedRowIds[group]]
    .map(rowId => allTickets[group].find(tk => tk.row_id === rowId))
    .filter(Boolean);
  if (selectedTickets.length === 0) return;

  const targetVersion = versions.find(v => v.version_id === targetVersionId);
  const ok = confirm(`선택한 ${selectedTickets.length}개 티켓을 "${targetVersion ? targetVersion.version_name : ''}" 버전으로 이동하시겠습니까?`);
  if (!ok) return;

  // 실시순서는 GAS moveTicket에서 버전 이동 시 무조건 초기화
  const succeeded = [];
  const failed = [];

  const overlay = document.getElementById('loading');
  const overlayText = overlay ? overlay.querySelector('.detail-loading-text') : null;
  if (overlay) overlay.style.display = 'flex';

  for (let i = 0; i < selectedTickets.length; i++) {
    const ticket = selectedTickets[i];
    if (overlayText) overlayText.textContent = `이동 중... (${i + 1}/${selectedTickets.length})`;

    if (ticket.version_id === targetVersionId) {
      succeeded.push(ticket);
      continue;
    }

    // 실패해도 중단하지 않고 다음 건 계속 진행. 재시도 없음(1건당 1회만 시도).
    try {
      await moveTicket(ticket.row_id, targetVersionId);
      succeeded.push(ticket);
    } catch (err) {
      console.error('[bulkMove] 이동 실패:', ticket.ticket_id, err);
      failed.push(ticket);
    }
  }

  if (overlay) overlay.style.display = 'none';
  if (overlayText) overlayText.textContent = t('loading');

  clearTicketsCaches();       // 이동으로 소속이 바뀐 티켓이 캐시로 되살아나 보이지 않도록 무효화
  toggleSelectionMode(group); // 선택 모드 종료(선택 목록 초기화 포함)
  await loadTickets();        // 최신 상태 재조회

  let msg = `이동 완료: ${succeeded.length}개 성공 / ${failed.length}개 실패`;
  if (failed.length) {
    msg += `\n\n실패한 티켓:\n${failed.map(tk => tk.ticket_id).join(', ')}`;
  }
  alert(msg);
}

// ─── 동적 필터 옵션 (담당자·확인버전) ────────────────────────────────────────

function populateDynamicFilters() {
  const all = allTicketsFlat();

  const assignees = [...new Set(all.map(tk => tk.assignee).filter(Boolean))].sort();
  document.querySelectorAll('.th-filter-select[data-filter-key="assignee"]').forEach(sel => {
    const cur = activeFilters.assignee;
    sel.innerHTML = `<option value="">${t('filter_all')}</option>` +
      assignees.map(a => `<option value="${escHtml(a)}"${cur === a ? ' selected' : ''}>${escHtml(a)}</option>`).join('');
    syncFilterWrap(sel, t('col_assignee'), cur);
  });

  const versions = [...new Set(
    all.flatMap(tk => (tk.check_version || '').split('\n').map(v => v.trim()).filter(Boolean))
  )].sort();
  document.querySelectorAll('.th-filter-select[data-filter-key="version"]').forEach(sel => {
    const cur = activeFilters.version;
    sel.innerHTML = `<option value="">${t('filter_all')}</option>` +
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

// ─── 모바일 검색 펼침/접힘 (≤768px 전용 — 버튼은 데스크톱에서 CSS로 숨김) ─────

function setupMobileSearch() {
  const toggle = document.getElementById('btn-search-toggle');
  const close  = document.getElementById('btn-search-close');
  const clear  = document.getElementById('btn-search-clear');
  const wrap   = document.querySelector('.search-wrap');
  const input  = document.getElementById('search-input');
  if (!toggle || !close || !clear || !wrap || !input) return;

  // 접힘 상태에서 검색어가 남아 있으면 돋보기에 배지 점 표시
  const updateBadge   = () => toggle.classList.toggle('has-filter', !!searchQuery);
  // input 안쪽 지우기 ×는 텍스트가 있을 때만 표시
  const updateHasText = () => wrap.classList.toggle('has-text', !!input.value);
  const closeSearch = () => {
    document.body.classList.remove('search-open');
    updateBadge();
  };

  toggle.addEventListener('click', () => {
    document.body.classList.add('search-open');
    updateHasText();
    input.focus();
  });
  close.addEventListener('click', closeSearch);
  input.addEventListener('input', updateHasText);

  // 지우기 ×: 검색어만 초기화(필터 해제), 검색창은 열린 채 포커스 유지.
  // mousedown preventDefault로 input blur를 막아 "빈 값 blur→자동 접힘"과 충돌하지 않음
  clear.addEventListener('mousedown', (e) => {
    e.preventDefault();
    input.value = '';
    searchQuery = '';
    updateHasText();
    renderAll();
    input.focus();
  });

  // 검색창을 비우고 포커스 아웃하면 자동 접힘 (검색어가 있으면 펼침 유지)
  input.addEventListener('blur', () => {
    if (!input.value.trim()) closeSearch();
  });
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
  renderSection('done',      filterTickets(allTickets.done),      false);
  renderSection('hold',      filterTickets(allTickets.hold),      true);

  // 항목 수에 따라 activeMVN/done/hold 섹션 자동 펼침/접힘
  // activeWW는 항목 유무와 무관하게 항상 열린 상태 유지 (자동 접힘 대상 제외)
  // 판정은 원본 개수 기준(필터 무시) → 그룹에 티켓이 애초에 없을 때만 접는다.
  for (const group of ['activeMVN', 'done', 'hold']) {
    const body = document.getElementById('section-' + group + '-body');
    const icon = document.getElementById('toggle-' + group);
    if (!body || !icon) continue;
    const hasItems = allTickets[group].length > 0;
    if (!hasItems) {
      body.classList.add('collapsed');
      icon.textContent = '▶';
    } else if (!userCollapsed.has(group)) {
      body.classList.remove('collapsed');
      icon.textContent = '▼';
    }
  }

  updateCounts();
  updateAllScrollHints(); // [실험적 기능] 렌더링 후 힌트 가시성 재계산
}

function renderSection(group, tickets, dimmed) {
  const tbody = document.getElementById('tbody-' + group);
  if (!tbody) return;

  if (tickets.length === 0) {
    tbody.innerHTML = `<tr class="no-data"><td colspan="11">${t('no_tickets')}</td></tr>`;
    return;
  }

  tbody.innerHTML = tickets.map(ticket => buildRow(ticket, dimmed, group)).join('');

  tbody.querySelectorAll('.navigate-cell').forEach(td => {
    td.addEventListener('click', () => {
      const rowId = td.closest('tr').dataset.rowId;
      if (!rowId) return;
      stopAutoRefresh();
      location.href = 'detail.html?id=' + rowId;
    });
  });

  tbody.querySelectorAll('.orig-icon-cell[data-orig]').forEach(td => {
    td.addEventListener('click', () => _toggleOrigPopover(td));
    td.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        _toggleOrigPopover(td);
      }
    });
  });

  tbody.querySelectorAll('.inline-select, .wjira-checkbox').forEach(el => {
    el.addEventListener('change', handleInlineChange);
  });

  tbody.querySelectorAll('.row-select-checkbox').forEach(el => {
    el.addEventListener('change', () => {
      const rowId = el.dataset.rowId;
      if (el.checked) selectedRowIds[group].add(rowId);
      else selectedRowIds[group].delete(rowId);
      updateBulkActionBar(group);
    });
  });
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
  // 상한은 활성 개수뿐 아니라 "같은 그룹+버전 내 현재 최대 실시순서 + 1"까지 보장 —
  // 앞 번호 티켓들이 완료로 빠지면 활성 개수 < 최대 번호가 되는데(갭 재사용 안 함 규칙),
  // 그 상태에서도 빈칸 티켓에 max+1(예: 4,5,6만 남았을 때 7)을 배정할 수 있어야 함.
  const activeCount = allTickets.activeWW.length + allTickets.activeMVN.length;
  const sameScopeMax = (allTickets[group] || [])
    .filter(tk => (tk.version_id || '') === (ticket.version_id || ''))
    .reduce((m, tk) => Math.max(m, Number(tk.priority) || 0), 0);
  const maxOrder = Math.max(5, activeCount, sameScopeMax + 1);
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
    `<option value="${v}" style="background-color:#fff;color:#111827"${ticket.status === v ? ' selected' : ''}>${statusLabel(v)}</option>`
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

  // 버전명 끝이 CU/CD면 앞에 색상 점(dot)으로만 구분 표시 — 텍스트는 전부 기본색 유지
  // (escHtml 이후 치환 — CU/CD는 이스케이프와 무관해 안전)
  const versionHtml = (ticket.check_version || '').split('\n')
    .map(v => v.trim()).filter(Boolean)
    .map(v => {
      const m = v.match(/(CU|CD)$/i);
      const dot = m ? `<span class="ver-dot ver-dot-${m[1].toUpperCase() === 'CU' ? 'cu' : 'cd'}"></span>` : '';
      const html = escHtml(v).replace(/(CU|CD)$/i, s => `<span class="ver-suffix">${s}</span>`);
      return `<div class="version-line">${dot}${html}</div>`;
    }).join('');

  // 언어 모드에 따라 번역된 이슈명 선택; 번역이 있으면 ⓘ 아이콘 추가
  // 원문에 일본어가 없는데 실제로 번역된 경우(순수 영어 등)는 "번역 / 원문"으로 슬래시 병기 —
  // 번역 결과만 보여주는 게 아니라 "이 티켓이 일본어 없이 등록됐다"는 사실 자체를 알리기 위함.
  // 일본어 혼용 케이스는 기존과 동일하게 번역 결과만 표시.
  const lang = getLang();
  const hasJapanese = JP_CHAR_RE.test(ticket.title || '');
  let displayTitle = ticket.title;
  let isTranslated = false;
  if (lang === 'ko' && ticket.title_ko && ticket.title_ko !== ticket.title) {
    displayTitle = hasJapanese ? ticket.title_ko : `${ticket.title_ko} / ${ticket.title}`;
    isTranslated = true;
  } else if (lang === 'vi' && ticket.title_vi && ticket.title_vi !== ticket.title) {
    displayTitle = hasJapanese ? ticket.title_vi : `${ticket.title_vi} / ${ticket.title}`;
    isTranslated = true;
  }
  const origIconTd = isTranslated
    ? `<td class="orig-icon-cell" tabindex="0" aria-label="원문 보기" data-orig="${escHtml(ticket.title)}">i</td>`
    : `<td class="orig-icon-cell orig-icon-empty"></td>`;

  // 선택 모드: 활성 그룹(WW/MVN) + 잠기지 않은 행만 clip-cell을 체크박스로 대체(새 컬럼 추가 없음)
  // 그룹별 독립 상태이므로 이 행이 속한 그룹의 selectionMode만 확인
  const canSelect = SELECTABLE_GROUPS.includes(group) && selectionMode[group] && isActive && !locked;
  const clipContent = canSelect
    ? `<input type="checkbox" class="row-select-checkbox" data-row-id="${escHtml(ticket.row_id)}"${selectedRowIds[group].has(ticket.row_id) ? ' checked' : ''}>`
    : ((isLockedForDisplay(ticket) || hasFiles) ? `<div class="status-icons">${isLockedForDisplay(ticket) ? `<span class="lock-icon" data-tip="${escHtml(t('tooltip_editing_by_other'))}">${PENCIL_SVG}</span>` : ''}${hasFiles ? `<svg data-tip="첨부 파일 - ${escHtml(firstFileName)}" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>` : ''}</div>` : '');

  return `
    <tr data-row-id="${escHtml(ticket.row_id)}" data-group="${escHtml(group || '')}" class="${rowClass}">
      <td class="clip-cell">${clipContent}</td>
      <td class="ticket-id-cell"><a href="https://wjira.humaxdigital.com/browse/${escHtml(ticket.ticket_id)}" target="_blank" class="ticket-link">${escHtml(ticket.ticket_id)}</a></td>
      ${origIconTd}
      <td class="title-cell navigate-cell"${displayTitle ? ` data-tip="${escHtml(displayTitle)}"` : ''}>${escHtml(displayTitle)}</td>
      <td class="navigate-cell version-cell">${versionHtml}</td>
      <td>${orderCell}</td>
      <td class="assignee-cell">${buildAssigneeSelectHtml(ticket.assignee || '', ticket.row_id, locked)}</td>
      <td class="status-cell"><select class="inline-select status-select ${statusClass}" data-field="status" data-row-id="${escHtml(ticket.row_id)}"${dis}>${statusOptions}</select></td>
      <td><select class="inline-select verdict-select ${verdictClass}" data-field="verdict" data-row-id="${escHtml(ticket.row_id)}"${dis}>${verdictOptions}</select></td>
      <td class="wjira-cell"><input type="checkbox" class="wjira-checkbox" data-field="wjira_updated" data-row-id="${escHtml(ticket.row_id)}"${wjiraChecked}${dis}></td>
      <td class="drag-handle-cell">${isActive ? `<span class="drag-handle" title="드래그하여 순서 변경">${GRIP_SVG}</span>` : ''}</td>
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
      // 완료/보류 섹션은 서버가 상태변경일시 내림차순(최신이 위)으로 내려주므로
      // 로컬에서도 맨 앞에 삽입해 새로고침 전후 위치를 일치시킨다.
      // 활성 그룹(DQA/MVN)은 renderAll의 sortByPriority가 재정렬하므로 삽입 위치 무관.
      if (toInactive) allTickets[newGroup].unshift(ticket);
      else allTickets[newGroup].push(ticket);
      renderAll();
      if (toInactive) {
        userCollapsed.delete(newGroup);
        saveSectionStates();
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

  // 드래그 종료 후 실시순서 재계산 + 저장 — 마우스(dragend)/터치(touchend) 공용
  async function finalizeDrag() {
    clearIndicators();
    isDragging = false;          // 자동 갱신 가드 해제
    lastEditAt = Date.now();     // 저장 레이스 방지 (재정렬 직후 갱신 지연)
    if (!dragRow) return;
    dragRow.classList.remove('dragging');
    dragRow.draggable = false; // 드래그 종료 후 draggable 해제

    const draggedId = dragRow.dataset.rowId;
    dragRow = null;

    // DOM 순서 (드롭 반영됨). allTickets는 아직 이전 priority 상태 → 영역 판정에 사용.
    // 잠긴 항목의 핸들 잠금(직접 이동 불가)과 시스템에 의한 순서 밀림은 별개다.
    // 순서 밀림(재번호)은 실시순서 중복 방지를 위해 잠긴 항목(.locked-row)도 계산에 포함한다.
    // (사용자가 잠긴 행을 직접 드래그하지 못하는 동작은 draggable-row 미부여로 그대로 유지되며,
    //  여기서는 다른 항목 이동에 따라 순서값이 밀리는 "계산 대상"으로만 포함한다.)
    const rows = [...tbody.querySelectorAll('tr.draggable-row[data-row-id], tr.locked-row[data-row-id]')];
    const getT = id => allTickets[group].find(tk => tk.row_id === id);
    const wasNumbered = t => t && String(t.priority) !== '';   // 드래그 전 번호 보유 여부

    const dragIdx = rows.findIndex(r => r.dataset.rowId === draggedId);
    const draggedT = getT(draggedId);
    if (dragIdx === -1 || !draggedT) { renderAll(); return; }

    // 드롭 위치의 앞/뒤 이웃으로 3구간 판정
    // (번호 항목은 항상 빈칸 항목보다 위에 정렬되므로 이웃만 봐도 충분)
    const nextT = dragIdx + 1 < rows.length ? getT(rows[dragIdx + 1].dataset.rowId) : null;
    const prevT = dragIdx - 1 >= 0 ? getT(rows[dragIdx - 1].dataset.rowId) : null;
    const nextIsNumbered = wasNumbered(nextT);
    const prevIsNumbered = wasNumbered(prevT);
    // A. 번호구역 내부/맨 앞(바로 뒤가 번호 항목) → 전체 재번호(cascade)
    // B. 번호구역 끝 경계(바로 뒤는 번호 아님, 바로 앞은 번호 항목 — 뒤가 빈칸이든 리스트 끝(null)이든 동일 취급)
    //    → 드래그 항목만 max+1, 원래 자리는 갭으로 유지, 나머지 불변
    // C. 빈칸구역(양쪽 다 번호 아님) → 드래그 항목 번호 삭제

    const updates = [];
    const setPri = (t, id, val) => {
      const v = String(val);
      if (String(t.priority ?? '') !== v) {
        t.priority = v;
        updates.push({ row_id: id, priority: v });
      }
    };

    if (nextIsNumbered) {
      // A. 번호구역 삽입: 삽입 위치 번호 할당 후 cascadeShift로 최소 밀림 (갭에서 즉시 멈춤).
      // prevT 번호+1 위치에 드래그 항목을 꽂고, 그 번호부터 연속된 기존 항목만 뒤로 민다.
      // 관련 없는 뒷부분(갭 너머 항목)은 건드리지 않는다.
      const fromNum = prevT && wasNumbered(prevT) ? Number(prevT.priority) + 1 : 1;
      setPri(draggedT, draggedId, fromNum);
      // cascadeShift: fromNum부터 연속된 번호만 +1씩 밀고 갭 만나면 즉시 중단 (드롭다운 경로와 동일 함수)
      const shifted = cascadeShift(allTickets[group], fromNum, draggedId);
      shifted.forEach(tk => updates.push({ row_id: tk.row_id, priority: tk.priority }));
    } else if (prevIsNumbered) {
      // B. 번호구역 끝 경계: 드래그 항목 제외 최댓값+1 할당. 원래 자리는 갭, 나머지 항목 불변.
      let max = 0;
      rows.forEach(r => {
        const id = r.dataset.rowId;
        if (id === draggedId) return;
        const t = getT(id);
        if (t && wasNumbered(t)) max = Math.max(max, Number(t.priority));
      });
      setPri(draggedT, draggedId, max + 1);
    } else {
      // C. 빈칸영역: 드래그 항목만 번호 삭제(원래 자리는 gap으로 유지), 나머지는 그대로.
      setPri(draggedT, draggedId, '');
    }

    renderAll(); // 재정렬 + priority 숫자 칩 갱신

    // 변경된 항목만 GAS에 저장
    if (updates.length) {
      await Promise.all(updates.map(u => updateTicket(u).catch(console.error)));
    }
  }

  tbody.addEventListener('dragend', finalizeDrag);

  // ─── 터치 드래그 (안드로이드 등 터치스크린 — HTML5 DnD는 touch 이벤트를 발생시키지 않음) ───
  // 네이티브 dragstart/dragover/drop을 쓰지 않고 touchmove에서 직접 DOM 위치를 옮긴다.
  let touchMoved = false;

  // 손가락 Y좌표 기준으로 삽입 대상 행과 위치를 계산 — elementFromPoint(픽셀 히트테스트) 불필요.
  // 손 뗀 지점 아래가 여백/버튼/셀 내부여도 좌표만 보므로 "맨 위로/맨 아래로" 이동이 확실히 잡힘.
  // 사용자가 직접 놓을 수 있는 대상은 draggable-row만 (locked-row는 드롭 타깃에서 제외 —
  // locked-row의 순서 밀림은 finalizeDrag의 cascadeShift가 별도 계산하므로 여기선 무관).
  function resolveTouchDrop(clientY) {
    const rows = [...tbody.querySelectorAll('tr.draggable-row[data-row-id]')].filter(r => r !== dragRow);
    if (rows.length === 0) return null;                       // 이동할 다른 행 없음 → 제자리
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2)               // 이 행의 중점보다 위 → 그 앞에 삽입
        return { targetRow: row, isBefore: true };
    }
    return { targetRow: rows[rows.length - 1], isBefore: false }; // 모든 중점보다 아래 → 맨 뒤
  }

  tbody.addEventListener('touchstart', e => {
    const handle = e.target.closest('.drag-handle');
    const row = e.target.closest('tr.draggable-row');
    if (!handle || !row) return;
    dragRow = row;
    touchMoved = false;
    requestAnimationFrame(() => { if (dragRow) dragRow.classList.add('dragging'); });
  }, { passive: true });

  tbody.addEventListener('touchmove', e => {
    if (!dragRow) return;
    touchMoved = true;
    isDragging = true;
    e.preventDefault(); // 페이지 스크롤/브라우저 기본 제스처 차단 (.drag-handle의 touch-action:none과 함께 동작)
    clearIndicators();
    const drop = resolveTouchDrop(e.touches[0].clientY);
    if (!drop) return;
    drop.targetRow.classList.add(drop.isBefore ? 'drop-above' : 'drop-below');
  }, { passive: false });

  tbody.addEventListener('touchend', e => {
    if (!dragRow) return;
    // 유령 클릭(터치 종료 후 브라우저가 같은 좌표에 합성 click을 발생시키는 것) 차단.
    // 지금은 tbody 위에 클릭 핸들러가 붙은 정렬 헤더가 없어 증상이 안 보이지만, versions.html에서
    // 이 패턴 때문에 실제 버그가 났었음 — 나중에 유사한 헤더가 생겨도 재발하지 않도록 선제 차단.
    e.preventDefault();
    if (touchMoved) {
      const drop = resolveTouchDrop(e.changedTouches[0].clientY);
      if (drop) {
        if (drop.isBefore) drop.targetRow.before(dragRow);
        else               drop.targetRow.after(dragRow);
      }
    }
    finalizeDrag();
  });

  tbody.addEventListener('touchcancel', () => {
    if (!dragRow) return;
    clearIndicators();
    dragRow.classList.remove('dragging');
    dragRow = null;
    isDragging = false;
  });
}

// ─── 자동 전체 갱신 (가드 붙은 주기적 새로고침) ───────────────────────────────
// 매 주기 전체 데이터를 받아 재렌더(재정렬·재그룹·잠금아이콘·컨트롤 포함).
// 단, 사용자가 조작 중이면 그 주기를 건너뛰어 행 점프/드롭다운 닫힘을 방지.

const REFRESH_MS    = 20000;       // 20초 주기 (LOCK_EXPIRE_MS는 상단에 정의됨)
const RETRY_DELAY_MS = 1500;       // 첫 번째 요청 실패 후 자동 재시도 대기
let refreshTimer = null;
let isDragging = false;            // 드래그 진행 중 (setupDragDrop에서 토글)
let lastEditAt = 0;                // 마지막 인라인 편집 시각 (저장 레이스 방지)

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);  // 중복 시작 방지
  refreshTimer = setInterval(refreshList, REFRESH_MS);
  // 탭이 다시 활성화되면 즉시 한 번 갱신
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshList();
  });
}
// interval 정리 — detail.html로 이동하는 등 목록 화면을 벗어날 때 호출(불필요한 API 호출 방지).
// 이 페이지는 전체 새로고침(location.href) 방식이라 페이지 이동 자체로도 정리되지만,
// detail.js의 lock-status 폴링과 동일하게 명시적으로도 정리한다.
function stopAutoRefresh() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
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

  const vid = currentVersionId === ALL_VERSION ? '' : currentVersionId;
  let data;
  try {
    data = await getTickets(vid);
  } catch (_) {
    return;                         // 실패는 조용히 무시 (다음 주기에 재시도)
  }

  saveTicketsCache(vid, data);     // 다음 페이지 진입 시 즉시 렌더용 캐시 갱신 (vid 키와 짝이 맞아 항상 안전)

  // 응답 대기 중 사용자가 다른 버전 탭으로 전환했으면 이 응답으로 화면을 덮지 않음
  // (fetchFreshList와 동일 가드 — 늦게 도착한 이전 탭 응답이 현재 탭 목록을 덮어쓰는 레이스 방지)
  const currentVid = currentVersionId === ALL_VERSION ? '' : currentVersionId;
  if (vid !== currentVid) return;

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

// ─── 하단 고정 가로스크롤바 ────────────────────────────────────────────────────

const stickyBarUpdaters = [];

function setupStickyScrollBars() {
  document.querySelectorAll('.table-scroll').forEach(tableScroll => {
    const bar = document.createElement('div');
    bar.className = 'sticky-scrollbar';

    // ── 화살표 버튼 생성
    function makeArrow(dir) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sticky-scrollbar-arrow';
      btn.textContent = dir === 'left' ? '◀' : '▶';
      btn.setAttribute('aria-label', dir === 'left' ? '왼쪽 스크롤' : '오른쪽 스크롤');

      const STEP_CLICK    = () => tableScroll.clientWidth * 0.25; // 클릭 1회
      const STEP_REPEAT   = 10;   // hold 중 px/frame
      const REPEAT_DELAY  = 400;  // hold 인식 딜레이(ms)
      const REPEAT_INTV   = 30;   // 반복 간격(ms)
      const sign = dir === 'left' ? -1 : 1;

      let startTimer = null;
      let repeatTimer = null;
      let didRepeat   = false;    // hold 중이었으면 click 무시

      const stopRepeat = () => {
        clearTimeout(startTimer);
        clearInterval(repeatTimer);
        startTimer = repeatTimer = null;
      };

      btn.addEventListener('click', () => {
        if (btn.disabled || didRepeat) { didRepeat = false; return; }
        tableScroll.scrollBy({ left: sign * STEP_CLICK(), behavior: 'smooth' });
      });

      btn.addEventListener('mousedown', e => {
        if (e.button !== 0 || btn.disabled) return;
        didRepeat = false;
        startTimer = setTimeout(() => {
          didRepeat = true;
          repeatTimer = setInterval(() => {
            if (btn.disabled) { stopRepeat(); return; }
            tableScroll.scrollLeft += sign * STEP_REPEAT;
          }, REPEAT_INTV);
        }, REPEAT_DELAY);
      });

      btn.addEventListener('mouseup',    stopRepeat);
      btn.addEventListener('mouseleave', stopRepeat);

      return btn;
    }

    const leftArrow  = makeArrow('left');
    const rightArrow = makeArrow('right');

    const track = document.createElement('div');
    track.className = 'sticky-scrollbar-track';
    const thumb = document.createElement('div');
    thumb.className = 'sticky-scrollbar-thumb';
    track.appendChild(thumb);

    bar.appendChild(leftArrow);
    bar.appendChild(track);
    bar.appendChild(rightArrow);
    tableScroll.parentNode.appendChild(bar);

    function update() {
      const { scrollLeft, scrollWidth, clientWidth } = tableScroll;
      const needsScroll = scrollWidth > clientWidth + 1;
      bar.classList.toggle('visible', needsScroll);
      if (!needsScroll) return;
      const trackW = track.clientWidth;
      const thumbW = Math.max(40, (clientWidth / scrollWidth) * trackW);
      const maxThumbLeft = trackW - thumbW;
      const thumbLeft = maxThumbLeft > 0
        ? (scrollLeft / (scrollWidth - clientWidth)) * maxThumbLeft
        : 0;
      thumb.style.width = thumbW + 'px';
      thumb.style.left  = thumbLeft + 'px';
      // 끝 지점 도달 시 해당 방향 버튼 비활성화
      leftArrow.disabled  = scrollLeft <= 0;
      rightArrow.disabled = scrollLeft >= scrollWidth - clientWidth - 1;
    }

    stickyBarUpdaters.push(update);
    tableScroll.addEventListener('scroll', update);
    new ResizeObserver(update).observe(tableScroll);

    track.addEventListener('click', e => {
      if (e.target === thumb) return;
      const rect = track.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      tableScroll.scrollLeft = ratio * (tableScroll.scrollWidth - tableScroll.clientWidth);
    });

    thumb.addEventListener('mousedown', e => {
      e.preventDefault();
      thumb.classList.add('dragging');
      const startX    = e.clientX;
      const startLeft = tableScroll.scrollLeft;
      const maxScroll = tableScroll.scrollWidth - tableScroll.clientWidth;
      const trackW    = track.clientWidth;
      const thumbW    = thumb.offsetWidth;
      const ratio     = maxScroll / (trackW - thumbW || 1);
      const onMove = e => {
        tableScroll.scrollLeft = Math.max(0, Math.min(maxScroll, startLeft + (e.clientX - startX) * ratio));
      };
      const onUp = () => {
        thumb.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    update();
  });
}

function updateAllStickyBars() {
  stickyBarUpdaters.forEach(fn => fn());
}

// ─── 좌우 스크롤 힌트 버튼 [실험적 기능 — 이 JS 블록 + CSS .scroll-hint-* 블록을 삭제하면 기능 제거] ──

const scrollHintUpdaters = [];
const SCROLL_HINT_TOPBAR_H = 56; // .topbar 높이 (position:sticky top:0)

function updateScrollHintPositions() {
  document.querySelectorAll('.scroll-hint-wrapper').forEach(wrapper => {
    const rect = wrapper.getBoundingClientRect();
    const visTop = Math.max(rect.top, SCROLL_HINT_TOPBAR_H);
    const visBot = Math.min(rect.bottom, window.innerHeight);
    if (visBot <= visTop) return;
    // 화면에 보이는 영역의 세로 중앙 → wrapper 기준 top 값으로 변환
    const btnTop = Math.max(0, (visTop + visBot) / 2 - rect.top - 20); // 20 = 버튼 반지름
    wrapper.querySelectorAll('.scroll-hint-btn').forEach(btn => {
      btn.style.top = btnTop + 'px';
    });
  });
}

let _scrollHintWindowListenerAdded = false;

function setupScrollHints() {
  document.querySelectorAll('.table-scroll').forEach(tableScroll => {
    const wrapper = document.createElement('div');
    wrapper.className = 'scroll-hint-wrapper';
    tableScroll.parentNode.insertBefore(wrapper, tableScroll);
    wrapper.appendChild(tableScroll);

    function makeOverlay(dir) {
      const overlay = document.createElement('div');
      overlay.className = 'scroll-hint-overlay scroll-hint-' + dir;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'scroll-hint-btn';
      btn.setAttribute('aria-label', dir === 'right' ? '오른쪽 스크롤' : '왼쪽 스크롤');
      btn.textContent = dir === 'right' ? '▶' : '◀';
      overlay.appendChild(btn);
      wrapper.appendChild(overlay);
      btn.addEventListener('click', () => {
        tableScroll.scrollBy({ left: (dir === 'right' ? 1 : -1) * tableScroll.clientWidth * 0.75, behavior: 'smooth' });
      });
      return overlay;
    }

    const leftOverlay  = makeOverlay('left');
    const rightOverlay = makeOverlay('right');

    function update() {
      const { scrollLeft, scrollWidth, clientWidth } = tableScroll;
      const canScroll = scrollWidth > clientWidth + 1;
      leftOverlay.classList.toggle('visible',  canScroll && scrollLeft > 1);
      rightOverlay.classList.toggle('visible', canScroll && scrollLeft < scrollWidth - clientWidth - 1);
    }

    scrollHintUpdaters.push(update);
    tableScroll.addEventListener('scroll', update, { passive: true });
    new ResizeObserver(update).observe(tableScroll);
    update();
  });

  if (!_scrollHintWindowListenerAdded) {
    window.addEventListener('scroll', updateScrollHintPositions, { passive: true });
    window.addEventListener('resize', updateScrollHintPositions, { passive: true });
    _scrollHintWindowListenerAdded = true;
  }
  updateScrollHintPositions();
}

function updateAllScrollHints() {
  scrollHintUpdaters.forEach(fn => fn());
  updateScrollHintPositions();
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── 번역된 이슈명 원문 팝오버 ────────────────────────────────────────────────────
let _origPopover     = null;
let _openPopoverIcon = null;
let _previewTooltip  = null;
let _previewShowing  = false;

// 팝오버 열기/닫기 토글. td listener에서 직접 호출.
function _toggleOrigPopover(icon) {
  _hidePreviewTooltip(); // 클릭 시 사전 안내 툴팁 즉시 닫기
  if (_openPopoverIcon === icon) {
    _origPopover.classList.remove('show');
    _openPopoverIcon = null;
    return;
  }
  _openPopoverIcon = icon;
  _origPopover.textContent = icon.dataset.orig;
  _origPopover.classList.add('show');
  _origPopover.style.left = '0';
  _origPopover.style.top  = '0';
  const pw   = _origPopover.offsetWidth;
  const rect = icon.getBoundingClientRect();
  const left = Math.max(4, Math.min(rect.left, window.innerWidth - pw - 8));
  _origPopover.style.left = left + 'px';
  _origPopover.style.top  = (rect.bottom + 6) + 'px';
}

// 사전 안내 툴팁 표시 — 팝오버가 열려 있거나 이미 표시 중이면 스킵
function _showPreviewTooltip(icon) {
  if (_openPopoverIcon || _previewShowing) return;
  _previewShowing = true;
  _previewTooltip.classList.add('show');
  _previewTooltip.style.left = '0';
  _previewTooltip.style.top  = '0';
  const tw   = _previewTooltip.offsetWidth;
  const rect = icon.getBoundingClientRect();
  // 아이콘 오른쪽 옆 + 상단 정렬 → 커서(아이콘 내부)와 겹치지 않음
  let left = rect.right + 10;
  let top  = rect.top - 2;
  if (left + tw > window.innerWidth - 8) left = rect.left - tw - 10; // 우측 벗어나면 왼쪽
  if (top < 4) top = rect.bottom + 4;                                 // 상단 벗어나면 아래
  _previewTooltip.style.left = left + 'px';
  _previewTooltip.style.top  = top + 'px';
}

// 사전 안내 툴팁 닫기
function _hidePreviewTooltip() {
  if (!_previewShowing) return;
  _previewShowing = false;
  _previewTooltip.classList.remove('show');
}

function setupOrigTitlePopover() {
  _origPopover = document.createElement('div');
  _origPopover.id = 'orig-title-popover';
  _origPopover.className = 'orig-title-popover';
  document.body.appendChild(_origPopover);

  // 사전 안내 툴팁 ('원문 표시') — PC hover 전용, touch에서는 mouseover 미발동
  _previewTooltip = document.createElement('div');
  _previewTooltip.className = 'icon-preview-tooltip';
  _previewTooltip.textContent = '원문 표시';
  document.body.appendChild(_previewTooltip);

  // 아이콘 셀 위 → 사전 안내 툴팁 표시 (PC 호버 전용)
  document.addEventListener('mouseover', e => {
    const cell = e.target.closest('.orig-icon-cell[data-orig]');
    if (cell) _showPreviewTooltip(cell);
  });

  // 아이콘 셀 벗어남 → 사전 안내 툴팁 닫기
  document.addEventListener('mouseout', e => {
    if (!e.target.closest('.orig-icon-cell[data-orig]')) return;
    const dest = e.relatedTarget;
    if (!dest || !dest.closest('.orig-icon-cell[data-orig]')) _hidePreviewTooltip();
  });

  // 팝오버 자체 클릭 → 닫기 (텍스트 드래그 선택 중이면 스킵)
  _origPopover.addEventListener('click', () => {
    if (window.getSelection && window.getSelection().toString().length > 0) return;
    _origPopover.classList.remove('show');
    _openPopoverIcon = null;
  });

  // 팝오버 외부 클릭 → 닫기 (아이콘 셀·팝오버 클릭은 각자 리스너에서 처리)
  document.addEventListener('click', e => {
    if (!_openPopoverIcon) return;
    if (e.target.closest('.orig-icon-cell') || e.target.closest('#orig-title-popover')) return;
    _origPopover.classList.remove('show');
    _openPopoverIcon = null;
  });
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
    updateAllStickyBars();
    updateAllScrollHints(); // [실험적 기능]
  }
  saveSectionStates();
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
