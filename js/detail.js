function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// 원문에 일본어 문자가 있는지 판정 (Code.gs의 JP_RUN_RE와 동일 문자 범위, 존재 여부만 확인)
const JP_CHAR_RE = /[぀-ゟ゠-ヿ一-龯　-〿㐀-䶿豈-﫿]/;

let isNewMode = false;
let isViewMode = false;    // true: 읽기 전용(다른 사용자가 편집 중) / false: 입력 가능(기본)
let isLockHeld = false;    // 잠금 획득 여부 (기존 티켓은 처음 내용을 바꾸는 순간 true)
let currentTicket = null;
let uploadedFiles = [];    // 이미 Drive에 저장된 {name, size, url} 목록
let pendingFiles = [];     // 아직 업로드 안 된 File 객체 목록 (저장 시 업로드)
let removedFileUrls = [];  // 삭제 예정 Drive 파일 URL (저장 시 Drive에서 제거)
let cachedAllTickets = null;
let isDirty = false;
let currentVersionId = '';  // 신규 등록 시 소속 버전 (URL 파라미터)
let allVersions = [];       // 전체 버전 목록 (드롭다운용)
let currentRowId = '';      // 조회/편집 중인 티켓 row_id
let returnToRowId = '';     // 신규 모드 취소 시 돌아갈 티켓 row_id (티켓 상세에서 "티켓등록"으로 진입한 경우)
let heartbeatTimer = null;  // 편집 잠금 heartbeat interval id
const HEARTBEAT_MS = 2 * 60 * 1000;  // 2분 주기 (5분 타임아웃의 절반 이하 — 1회 유실돼도 다음 신호가 만료 전 도착)
let lockPollTimer = null;   // 보기모드 중 "다른 사람이 편집 시작했는지" 폴링 interval id
let lockPollDelayTimer = null;  // 폴링 "시작"을 지연시킬 때 쓰는 setTimeout id (저장 직후 등)
const LOCK_POLL_MS = 10 * 1000;  // 10초 주기

function markDirty() {
  if (isLeaving) return;  // 이동 중에 뒤늦게 오는 change 신호로 변경 표시가 다시 켜지지 않게
  isDirty = true;
  ensureBackGuard();  // 바꾼 뒤 브라우저 뒤로가기에도 확인 팝업을 띄우기 위한 준비
  requestEditLock();  // 기존 티켓: 처음 바꾸는 순간 편집 잠금 시도 (신규 등록은 잠금 없음)
}
function resetDirty() { isDirty = false; }

// 다른 화면으로 이동을 시작할 때 호출. 이동하는 순간 브라우저가 입력창의 change 신호를 한 번 더 보내
// 변경 표시가 다시 켜지면 브라우저 기본 경고가 또 뜨므로, 이동 중에는 변경 표시를 잠근다.
// 이동이 실제로 일어나지 않으면(3초 뒤에도 이 화면이 살아 있으면) 잠금을 푼다.
let isLeaving = false;
function startLeaving() {
  isLeaving = true;
  resetDirty();
  pendingFiles = [];
  setTimeout(() => { isLeaving = false; }, 3000);
}

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

// 보기모드 진입 시 시작: 즉시 1회 확인 + 10초 주기로 "다른 사람이 편집 중인지" 재확인.
// 잠금을 잡으면(ensureEditLock) 반드시 정지 — heartbeat와 동시에 돌면 안 됨.
function startLockPoll(rowId) {
  stopLockPoll();  // 중복 시작 방지
  pollLockStatus(rowId);
  lockPollTimer = setInterval(() => pollLockStatus(rowId), LOCK_POLL_MS);
}
// interval(+지연 예약) 정리 — 편집모드 전환, 페이지 이탈/목록 복귀 등 모든 경로에서 호출.
function stopLockPoll() {
  if (lockPollDelayTimer) { clearTimeout(lockPollDelayTimer); lockPollDelayTimer = null; }
  if (lockPollTimer) { clearInterval(lockPollTimer); lockPollTimer = null; }
}
async function pollLockStatus(rowId) {
  try {
    const result = await checkLock(rowId);
    // 응답 대기 중 내가 잠금을 잡았거나(내 잠금을 "편집 중"으로 오인하는 레이스 방지)
    // 신규 모드/다른 티켓으로 넘어갔으면 이 결과는 폐기.
    if (isLockHeld || isNewMode || rowId !== currentRowId) return;
    const locked = !!(result && result.locked);
    updateLockStatusBadge(locked);
    // 잠금 요청 중이거나 저장 중이면 화면 전환은 보류
    if (lockRequest || isSaving) return;
    if (locked && !isViewMode) {
      // 다른 사용자가 편집을 시작함 — 내가 아직 아무것도 바꾸지 않았을 때만 읽기 전용으로 전환
      // (이미 바꾼 게 있으면 그 변경의 잠금 요청이 거절 처리를 한다)
      if (!isDirty && pendingFiles.length === 0) {
        isViewMode = true;
        applyViewUI();
      }
    } else if (!locked && isViewMode) {
      // 다른 사용자의 편집이 끝남 — 최신 내용으로 갱신하고 다시 입력 가능 상태로
      refreshTicketFresh(rowId, true, true);
    }
  } catch (err) {
    // 조회 실패는 조용히 무시(재시도 없음 — 다음 10초 주기에 자연 재시도됨)
  }
}
function updateLockStatusBadge(locked) {
  const el = document.getElementById('lock-status');
  if (!el) return;
  if (locked) {
    el.innerHTML = `<span class="lock-status-icon">🔒</span><span>${t('badge_editing_in_progress')}</span>`;
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
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
  if (isLockHeld && currentRowId) {
    navigator.sendBeacon(GAS_URL, new URLSearchParams({ type: 'unlockTicket', row_id: currentRowId }));
  }
}

// 잠금 해제를 fire-and-forget(sendBeacon)로 처리 — 응답을 기다리지 않아 이동이 즉시 일어남
function releaseLockNow() {
  stopHeartbeat();
  if (!isLockHeld || !currentRowId) return;
  window.removeEventListener('beforeunload', handleLockBeforeUnload);
  navigator.sendBeacon(GAS_URL, new URLSearchParams({ type: 'unlockTicket', row_id: currentRowId }));
  // 목록에 "방금 내가 해제한 항목" 힌트 전달 → 서버 반영 전까지 자기 자물쇠 억제
  sessionStorage.setItem('dqa_released_row', currentRowId);
  isLockHeld = false;
  currentRowId = '';
}

// 잠금 해제 — 페이지 이동 없이 같은 페이지에서 계속 사용하므로 currentRowId는 유지
function releaseLockKeepId() {
  stopHeartbeat();
  if (!isLockHeld || !currentRowId) return;
  window.removeEventListener('beforeunload', handleLockBeforeUnload);
  navigator.sendBeacon(GAS_URL, new URLSearchParams({ type: 'unlockTicket', row_id: currentRowId }));
  isLockHeld = false;
}

// ─── 브라우저 뒤로가기 보호 ──────────────────────────────────────────────────────
// 내용을 바꾼 뒤 브라우저(또는 폰)의 뒤로가기를 누르면 우리 확인 팝업을 띄운다.
// 방법: 처음 바꿀 때 같은 주소의 기록을 한 칸 더 쌓아 두고, 뒤로가기로 그 칸이 빠지면(popstate)
// 변경 여부를 확인한다. 쌓아 둔 칸이 있는 동안 "목록" 버튼은 두 칸을 되돌아가야 한다(navigateToList).
// 신규 등록 화면은 쓰지 않는다(등록 직후 replaceState로 주소를 바꾸므로 기록이 어긋남) — 거긴 브라우저 기본 경고.
let backGuardPushed = false;
function ensureBackGuard() {
  if (isNewMode || backGuardPushed) return;
  history.pushState({ dqaBackGuard: true }, '');
  backGuardPushed = true;
}

// ─── 편집 잠금 (처음 바꾸는 순간 획득) ─────────────────────────────────────────
// 기존 티켓은 열자마자 입력 가능한 상태로 열리고, 잠금은 처음 내용을 바꿀 때 한 번 건다.
// 그래서 보기만 하는 사람은 다른 사람의 편집을 막지 않는다.
let lockRequest = null;  // 잠금 요청 진행 중이면 그 Promise (중복 요청 방지)

// true: 편집 가능(잠금을 잡았거나 잠금이 필요 없음) / false: 다른 사용자가 편집 중이라 거절됨
function ensureEditLock() {
  if (isNewMode || isLockHeld) return Promise.resolve(true);
  if (lockRequest) return lockRequest;
  lockRequest = (async () => {
    const rowId = currentRowId;
    const lockResult = await lockTicket(rowId).catch(() => null);
    if (lockResult && lockResult.locked) return false;
    // 통신 실패(null)는 잠금 없이 진행 (기존 "수정" 버튼 때와 동일)
    if (lockResult && rowId === currentRowId) {
      isLockHeld = true;
      window.addEventListener('beforeunload', handleLockBeforeUnload);
      startHeartbeat(rowId);
      stopLockPoll();  // heartbeat와 동시에 돌면 안 됨
      updateLockStatusBadge(false);
    }
    return true;
  })().finally(() => { lockRequest = null; });
  return lockRequest;
}

// 처음 내용을 바꾸는 순간 호출(markDirty) — 이미 다른 사용자가 편집 중이면 되돌리고 읽기 전용으로 전환
async function requestEditLock() {
  if (isNewMode || isViewMode || isLockHeld || lockRequest || !currentTicket) return;
  if (!(await ensureEditLock())) revertToLockedView();
}

// 다른 사용자가 편집 중이라 잠금이 거절됨: 방금 바꾼 내용을 버리고 읽기 전용으로 되돌린다.
// 여러 곳(입력·저장·삭제·버전 이동)에서 불려도 한 번만 처리되도록 이미 읽기 전용이면 무시.
function revertToLockedView() {
  if (isViewMode) return;
  alert(t('error_ticket_locked'));
  fillForm(currentTicket);
  renderVersionSelect(currentTicket.version_id || '');
  pendingFiles = [];
  removedFileUrls = [];
  resetDirty();
  enterViewMode();
  updateLockStatusBadge(true);
}

document.addEventListener('DOMContentLoaded', async () => {
  applyTranslations();

  // 언어 전환 시 UI 텍스트 + 번역 힌트만 갱신 — 잠금(lock) 로직 일체 건드리지 않음
  onLangChange(() => {
    applyTranslations();
    renderAllDetectedLinks();
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
  const rawVersionId = params.get('version_id') || '';
  // 내부 기호 __NONE__ 이 실제 데이터로 유입되지 않도록 정규화
  currentVersionId = (rawVersionId === '__NONE__') ? '' : rawVersionId;
  returnToRowId = params.get('from') || '';

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
  ['check-content', 'note'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => renderDetectedLinks(id));
  });

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
  const leavePage = (url) => {
    startLeaving();
    releaseLockNow();
    stopLockPoll();
    location.href = url;
  };
  const navigateToList = () => {
    // 브라우저 히스토리가 있고 이전 페이지가 index.html인 경우 history.back() 사용하여 상태(검색/필터/스크롤) 유지
    // 그 외의 경우(직접 링크 진입 등)는 index.html로 강제 이동
    if (window.history.length > 1 && document.referrer.includes('index.html')) {
      startLeaving();
      releaseLockNow();
      stopLockPoll();
      // 뒤로가기 보호용으로 쌓아 둔 기록 칸이 있으면 그것까지 두 칸 되돌아간다
      const steps = backGuardPushed ? -2 : -1;
      backGuardPushed = false;
      history.go(steps);
    } else {
      leavePage('index.html');
    }
  };
  // 취소 버튼은 신규 등록 화면에서만 보인다
  document.getElementById('btn-cancel-top').addEventListener('click', () => {
    // 티켓 상세에서 "티켓등록"으로 진입한 경우엔 보던 티켓으로 복귀, 아니면 목록으로
    if (confirmLeave()) leavePage(returnToRowId ? 'detail.html?id=' + encodeURIComponent(returnToRowId) : 'index.html');
  });
  document.getElementById('btn-back').addEventListener('click', () => { if (isViewMode || confirmLeave()) navigateToList(); });
  // 브라우저 뒤로가기: 쌓아 둔 기록 칸이 빠졌을 때만 처리 (ensureBackGuard 참고)
  window.addEventListener('popstate', () => {
    if (!backGuardPushed) return;
    backGuardPushed = false;  // 쌓아 둔 칸이 빠져 원래 칸으로 돌아온 상태
    if (isDirty || pendingFiles.length > 0) {
      if (!confirm(t('confirm_leave'))) { ensureBackGuard(); return; }  // 머물기: 칸을 다시 쌓아 둔다
    }
    navigateToList();  // 이동: "목록" 버튼과 같은 경로 (잠금 해제·검색/필터 상태 유지)
  });
  document.getElementById('btn-delete').addEventListener('click', handleDelete);
  document.getElementById('btn-new-ticket').addEventListener('click', () => {
    if (!confirmLeave()) return;
    startLeaving();    // 이동 시 브라우저 기본 경고가 한 번 더 뜨지 않도록
    const vId = (currentTicket && currentTicket.version_id) || currentVersionId || '';
    const qs = new URLSearchParams();
    if (vId) qs.set('version_id', vId);
    if (currentRowId) qs.set('from', currentRowId);  // 취소 시 이 티켓으로 복귀할 수 있도록 전달
    const q = qs.toString();
    location.href = q ? `detail.html?${q}` : 'detail.html';
  });

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

// 저장 버튼 라벨(등록/저장)은 항상 isNewMode에서 그때그때 유도 —
// 특정 시점에 라벨을 심어두고 나중에 손으로 되돌리는 방식은 예외 경로에서 누락 위험이 있어 금지.
// data-i18n도 함께 갱신하므로 언어 전환(applyTranslations) 시에도 올바른 키로 재번역된다.
function refreshSaveBtnLabel() {
  const btn = document.getElementById('btn-save-top');
  btn.dataset.i18n = isNewMode ? 'btn_register' : 'btn_save';
  btn.textContent = t(btn.dataset.i18n);
}

// ─── 신규 모드 ────────────────────────────────────────────────────────────────

async function initNewMode() {
  document.getElementById('page-title').textContent = t('page_title_new');
  document.getElementById('ticket-id-edit-wrap').style.display = '';
  document.getElementById('ticket-id-static').style.display = 'none';
  document.getElementById('created-date').textContent = formatDate(new Date());
  document.getElementById('link-group').style.display = '';          // 신규: 바로가기 버튼 자리 유지
  document.getElementById('done-date-group').style.display = 'none'; // 신규: 완료 일시 숨김
  document.getElementById('btn-save-top').style.display = '';
  document.getElementById('btn-cancel-top').style.display = '';
  document.getElementById('btn-new-ticket').style.display = 'none'; // 이미 신규 등록 화면이라 재진입 불필요
  refreshSaveBtnLabel();

  // 담당자 선택 시 같은 그룹+버전 기준으로 실시순서 재계산 (Rule 1)
  const assigneeEl = document.getElementById('assignee');
  const refreshPrioritySuggestion = () => {
    populatePriorityOptions(getSuggestedPriority(assigneeEl.value, currentVersionId));
  };
  assigneeEl.addEventListener('change', refreshPrioritySuggestion);
  const applyVersionData = () => {
    renderVersionSelect(currentVersionId);
    refreshPrioritySuggestion();
  };

  // 캐시 우선: 목록에서 받아둔 데이터가 있으면 즉시 반영 + 오버레이 제거.
  // 최신 데이터는 이 함수 맨 끝에서 백그라운드로 받아 갈아끼운다(실시순서 제안값도 그때 보정).
  const cachedData = loadAnyTicketsCache(currentVersionId);
  if (cachedData) {
    cachedAllTickets = cachedData;
    allVersions = cachedData.versions || [];
    applyVersionData();
    document.getElementById('detail-loading').style.display = 'none';
  }

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

  // 최신 데이터 로드 — 백그라운드 fire-and-forget (await 금지).
  // initNewMode 자체가 DOMContentLoaded에서 await되므로, 여기서 기다리면 뒤에 배선되는
  // 버튼 리스너들이 콜드스타트 내내 죽어있게 됨. 캐시로 이미 그렸으면 조용히 보정,
  // 캐시가 없었으면 이 완료 시점에 오버레이 제거.
  (async () => {
    try {
      cachedAllTickets = await getTickets();
      saveTicketsCache('', cachedAllTickets);
      allVersions = cachedAllTickets.versions || [];
    } catch (_) {}
    applyVersionData();
    document.getElementById('detail-loading').style.display = 'none';
  })();
}

// ─── 수정 모드 ────────────────────────────────────────────────────────────────

function loadTicket(rowId) {
  document.getElementById('page-title').textContent = t('page_title_edit');

  // 입력 가능 상태로 열림 — 잠금은 처음 내용을 바꾸는 순간(ensureEditLock)에 시도.
  // 다른 사람이 이미 편집 중이면 첫 폴링 결과로 읽기 전용에 전환된다.
  currentRowId = rowId;
  isViewMode = false;

  // 캐시 우선 렌더링: 목록에서 이미 받아둔 데이터가 있으면 로딩 오버레이 없이 즉시 표시.
  const cachedHit = findTicketInCaches(rowId);
  if (cachedHit) {
    cachedAllTickets = cachedHit.data;
    allVersions = cachedHit.data.versions || [];
    currentTicket = cachedHit.ticket;
    fillForm(currentTicket);
    renderVersionSelect(currentTicket.version_id || '');
    enterEditMode();
    document.getElementById('detail-loading').style.display = 'none';
  } else {
    document.getElementById('detail-loading').style.display = 'flex';
  }

  // 최신 데이터는 백그라운드로 — 절대 await 하지 않는다.
  // (이 함수는 DOMContentLoaded에서 await되므로, 여기서 fetch를 기다리면 뒤에 배선되는
  //  목록/수정/저장 버튼 리스너들이 콜드스타트 내내 죽어있게 됨)
  refreshTicketFresh(rowId, !!cachedHit);
}

// toEdit: 읽기 전용 → 입력 가능으로 되돌리는 경우(다른 사용자의 편집이 끝났을 때)
async function refreshTicketFresh(rowId, hadCache, toEdit) {
  try {
    const fresh = await getTickets();
    saveTicketsCache('', fresh);
    cachedAllTickets = fresh;
    allVersions = fresh.versions || [];
    const all = [...fresh.activeWW, ...fresh.activeMVN, ...fresh.done, ...fresh.hold];
    const freshTicket = all.find(tk => tk.row_id === rowId);
    // 최신 데이터에 없으면(그 사이 삭제됨) 캐시로 그렸더라도 목록으로 되돌림
    if (!freshTicket) throw new Error('티켓을 찾을 수 없습니다: ' + rowId);
    currentTicket = freshTicket;
    // 사용자가 이미 입력을 시작했거나 잠금을 잡았으면 폼을 덮어쓰지 않음
    if (!isDirty && !isLockHeld && pendingFiles.length === 0) {
      fillForm(currentTicket);
      renderVersionSelect(currentTicket.version_id || '');
      if (toEdit) isViewMode = false;
      if (isViewMode) enterViewMode(); else enterEditMode();
    }
  } catch (err) {
    // 캐시로 이미 표시된 상태의 일시적 네트워크 오류는 조용히 무시 (티켓 없음은 위에서 throw됨)
    if (!hadCache || /티켓을 찾을 수 없습니다/.test(err.message)) {
      alert(err.message);
      location.href = 'index.html';
    }
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

  // 신규 모드이고 버전이 지정되지 않은 경우 sort_order 최대 버전으로 자동 선택 (최신 버전 우선)
  if (isNewMode && !selectedId && allVersions.length > 0) {
    const latest = allVersions.reduce((a, b) => a.sort_order >= b.sort_order ? a : b);
    selectedId = latest.version_id;
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

    // 기존 티켓: 즉시 이동 처리 (다른 사용자가 편집 중이면 거절)
    if (!(await ensureEditLock())) { revertToLockedView(); return; }
    const overlay = document.getElementById('detail-loading');
    if (overlay) overlay.style.display = 'flex';
    try {
      await moveTicket(currentTicket.row_id, targetId);
      clearTicketsCaches();  // 버전 소속이 바뀌었으므로 목록 캐시 무효화
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
  document.getElementById('link-group').style.display = 'none'; // 열람/수정: 바로가기 칸 숨겨 등록·완료 일시를 앞으로
  renderDoneDate(ticket);

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

// ─── 표시/편집 모드 전환 ──────────────────────────────────────────────────────

// 화면 상태는 두 가지(isViewMode로 구분):
//  · 입력 가능(isViewMode=false): 기본. 잠금은 처음 바꾸는 순간 ensureEditLock()이 건다
//  · 읽기 전용(isViewMode=true): 다른 사용자가 편집 중인 티켓
// applyViewUI/applyEditUI는 화면만 바꾸고 잠금·폴링은 건드리지 않는다.

const UNLOCK_POLL_DELAY_MS = 800;  // 잠금 해제 요청(sendBeacon)이 서버에 반영될 시간

// 내가 잠금을 잡고 있지 않은 동안 "다른 사람이 편집 중인지" 폴링을 시작한다.
// pollDelayMs: 지정 시 폴링 "시작"만 그 시간만큼 늦춘다. 저장 직후에 사용 — sendBeacon으로 쏜
// unlock 요청은 완료를 기다릴 수 없는 구조라, 바로 폴링하면 서버가 아직 LOCKED_AT을 못 지운 상태를
// 읽어 내 잠금을 "편집 중"으로 오탐할 수 있다. 서버 처리 시간을 감안한 유예를 준 뒤 시작한다.
function scheduleLockPoll(pollDelayMs) {
  if (isNewMode || isLockHeld || !currentRowId) return;
  if (pollDelayMs) {
    stopLockPoll();
    lockPollDelayTimer = setTimeout(() => {
      lockPollDelayTimer = null;
      // 유예 시간 동안 잠금을 잡았거나 페이지를 벗어났으면 시작하지 않음
      if (!isLockHeld && !isNewMode && currentRowId) startLockPoll(currentRowId);
    }, pollDelayMs);
  } else {
    startLockPoll(currentRowId);
  }
}

function enterViewMode(pollDelayMs) {
  isViewMode = true;
  scheduleLockPoll(pollDelayMs);
  applyViewUI();
}

function enterEditMode(pollDelayMs) {
  isViewMode = false;
  scheduleLockPoll(pollDelayMs);
  applyEditUI();
}

function applyViewUI() {
  // 모든 폼 요소 비활성화
  document.querySelectorAll('#ticket-form input, #ticket-form select, #ticket-form textarea').forEach(el => {
    el.disabled = true;
  });

  // 업로드/입력 영역 숨김
  const dropZone = document.getElementById('drop-zone');
  const linksGrid = document.querySelector('.links-grid');
  if (dropZone)   dropZone.style.display = 'none';
  if (linksGrid)  linksGrid.style.display = 'none';
  document.getElementById('btn-clear-title').style.display = 'none';

  document.getElementById('page-title').textContent = t('page_title_edit');
  document.getElementById('btn-save-top').style.display = 'none';
  document.getElementById('btn-cancel-top').style.display = 'none';
  document.getElementById('btn-delete').style.display = 'none';
  document.getElementById('btn-new-ticket').style.display = '';
  document.getElementById('btn-new-ticket').disabled = false;

  // 확인결과/비고: 텍스트 뷰 표시, textarea 숨김
  renderTextView('check-content');
  renderTextView('note');
  renderAllDetectedLinks();  // textarea가 숨겨졌으니 인식된 링크 목록은 비워진다

  // 파일/링크 재렌더링 (삭제 버튼·X 버튼 없는 버전)
  renderFileList();
  renderLinks();
}

function applyEditUI() {
  // 모든 폼 요소 활성화
  document.querySelectorAll('#ticket-form input, #ticket-form select, #ticket-form textarea').forEach(el => {
    el.disabled = false;
  });
  // 실시순서는 읽기전용 유지
  document.getElementById('priority').readOnly = true;

  // 업로드/입력 영역 표시
  const dropZone = document.getElementById('drop-zone');
  const linksGrid = document.querySelector('.links-grid');
  if (dropZone)  dropZone.style.display = '';
  if (linksGrid) linksGrid.style.display = '';

  // clear title 버튼 복원
  const titleInput = document.getElementById('title-input');
  if (titleInput.value) document.getElementById('btn-clear-title').style.display = '';

  document.getElementById('page-title').textContent = t('page_title_edit');
  document.getElementById('btn-save-top').style.display = '';
  refreshSaveBtnLabel();
  document.getElementById('btn-cancel-top').style.display = 'none';  // 취소는 신규 등록 화면에서만
  document.getElementById('btn-delete').style.display = '';
  document.getElementById('btn-new-ticket').style.display = '';       // 이탈 시에는 클릭 핸들러가 변경 확인
  document.getElementById('btn-new-ticket').disabled = false;

  // 확인결과/비고: textarea 표시, 텍스트 뷰 숨김
  document.getElementById('check-content-view').style.display = 'none';
  document.getElementById('check-content').style.display = '';
  document.getElementById('note-view').style.display = 'none';
  document.getElementById('note').style.display = '';
  renderAllDetectedLinks();

  // 파일/링크 재렌더링 (삭제 버튼·X 버튼 있는 버전)
  renderFileList();
  renderLinks();
}

// URL을 <a> 링크로 변환해 text-view에 렌더링
function renderTextView(fieldId) {
  const textarea = document.getElementById(fieldId);
  const view     = document.getElementById(fieldId + '-view');
  if (!textarea || !view) return;

  const text = textarea.value;
  // https?:// 또는 www. 로 시작하는 URL 매칭. www.은 href에 https:// 를 붙여 생성.
  const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/g;
  let result = '', lastIdx = 0, m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    const raw  = m[0];
    const href = raw.startsWith('www.') ? 'https://' + raw : raw;
    result += escHtml(text.slice(lastIdx, m.index));
    result += `<a href="${escHtml(href)}" target="_blank" rel="noopener">${escHtml(raw)}</a>`;
    lastIdx = m.index + m[0].length;
  }
  result += escHtml(text.slice(lastIdx));
  view.innerHTML = result || '';

  textarea.style.display = 'none';
  view.style.display = '';
}

// 입력 중(textarea 표시 중)에는 URL이 그냥 글자라 클릭할 수 없으므로, 입력창 아래에
// 인식된 URL을 클릭 가능한 링크로 나열한다. 읽기 전용(텍스트 뷰)일 땐 뷰 안의 링크를 쓰므로 비운다.
function renderDetectedLinks(fieldId) {
  const textarea = document.getElementById(fieldId);
  const box      = document.getElementById(fieldId + '-links');
  if (!textarea || !box) return;
  if (textarea.style.display === 'none') { box.innerHTML = ''; return; }

  const seen = new Set();
  const items = [];
  const re = /(?:https?:\/\/|www\.)[^\s<>"']+/g;
  let m;
  while ((m = re.exec(textarea.value)) !== null) {
    const raw = m[0].replace(/[.,;:!?、。]+$/, '');  // 문장 끝 구두점은 URL에서 제외
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    items.push({ raw, href: raw.startsWith('www.') ? 'https://' + raw : raw });
  }
  box.innerHTML = items.length
    ? `<span class="detected-links-label">🔗 ${escHtml(t('label_detected_links'))}</span>` +
      items.map(i => `<a href="${escHtml(i.href)}" target="_blank" rel="noopener" title="${escHtml(i.raw)}">${escHtml(i.raw)}</a>`).join('')
    : '';
}

function renderAllDetectedLinks() {
  renderDetectedLinks('check-content');
  renderDetectedLinks('note');
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
    const deleteBtn = isViewMode ? '' : `<button type="button" class="btn btn-file-delete btn-file-action" data-type="saved" data-idx="${idx}">삭제</button>`;
    return `<div class="file-item">
      <span class="file-clip">${CLIP_SVG}</span>
      ${nameHtml}
      ${sizeHtml}
      <div class="file-actions">
        <a href="${dlUrl}" target="_blank" class="btn btn-secondary btn-file-action">다운로드</a>
        ${deleteBtn}
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

// 주소 앞에 https:// 같은 시작 부분이 없으면(예: www.google.com) 브라우저가 이 사이트 안의 주소로 취급해
// 열리지 않으므로, 링크로 열 때만 https://를 붙인다. (저장된 값은 입력한 그대로 둔다)
function toOpenableUrl(url) {
  const u = String(url || '').trim();
  return /^[a-z][a-z0-9+.\-]*:/i.test(u) ? u : 'https://' + u;
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
    const xBtn = isViewMode ? '' : `<button type="button" class="link-clear-btn" data-link-num="${item.num}" title="링크 삭제">×</button>`;
    return `<div class="links-display-item">
      <a href="${escHtml(toOpenableUrl(item.url))}" target="_blank" rel="noopener" class="link-display-anchor">${escHtml(text)}</a>
      ${xBtn}
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
  if (!(await ensureEditLock())) { revertToLockedView(); return; }  // 다른 사용자가 편집 중이면 삭제 불가

  setDeletingState(true);
  try {
    await deleteTicket(currentTicket.row_id);
    clearTicketsCaches();  // 삭제된 티켓이 캐시로 되살아나 보이지 않도록 무효화
    // 삭제된 행이라 잠금도 사라짐 — heartbeat/리스너만 정리하고 즉시 이동
    stopHeartbeat();
    window.removeEventListener('beforeunload', handleLockBeforeUnload);
    currentRowId = '';
    startLeaving();
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
  if (isLeaving) return;  // 이미 확인을 받고 이동 중
  if (isSaving || isDirty || pendingFiles.length > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
});

async function handleSave() {
  if (isSaving) return;
  if (!(await ensureEditLock())) { revertToLockedView(); return; }  // 다른 사용자가 편집 중이면 저장 불가
  if (isSaving) return;  // 잠금 대기 중 저장 버튼을 연타해도 한 번만 저장

  setSavingState(true);
  try {
    // pending 파일을 저장 시점에 Drive 업로드
    if (pendingFiles.length > 0) {
      const overlay = document.getElementById('detail-loading');
      const text    = overlay && overlay.querySelector('.detail-loading-text');
      for (let i = 0; i < pendingFiles.length; i++) {
        if (text) text.textContent = `업로드 중... (${i + 1}/${pendingFiles.length})`;
        const uploaded = await uploadFile(pendingFiles[i]);
        uploadedFiles.push({ name: pendingFiles[i].name, size: pendingFiles[i].size, url: uploaded.fileUrl });
      }
      pendingFiles = [];
      renderFileList();
    }

    const formData = collectFormData();

    if (isNewMode) {
      const numPart = document.getElementById('ticket-id-num').value.trim();
      if (!numPart) { alert('티켓번호를 입력하세요.'); setSavingState(false); return; }
      const ticketId = getPrefix() + numPart;

      const addResult = await addTicket({ ticket_id: ticketId, version_id: currentVersionId, ...formData });
      currentRowId  = addResult.row_id;
      currentTicket = { row_id: addResult.row_id, ticket_id: ticketId, created_date: new Date().toISOString(), status_changed_at: new Date().toISOString(), version_id: currentVersionId, ...formData };
      document.getElementById('link-group').style.display = 'none';
      renderDoneDate(currentTicket);
      isNewMode = false;
      refreshSaveBtnLabel();

      // 티켓번호 영역: 입력 필드 → 정적 JIRA 링크로 전환
      document.getElementById('ticket-id-edit-wrap').style.display = 'none';
      document.getElementById('btn-wjira-link').style.display = 'none';
      const staticEl = document.getElementById('ticket-id-static');
      staticEl.style.display = '';
      staticEl.innerHTML = `<a href="https://wjira.humaxdigital.com/browse/${escHtml(ticketId)}" target="_blank">${escHtml(ticketId)}</a>`;

      // URL 갱신 — 뒤로가기 시 이 티켓 상세로 진입
      history.replaceState(null, '', 'detail.html?id=' + encodeURIComponent(addResult.row_id));
    } else {
      const statusChanged = formData.status !== currentTicket.status;
      await updateTicket({ row_id: currentTicket.row_id, ...formData });
      // 취소 시 원복 기준값 갱신
      Object.assign(currentTicket, formData);
      if (statusChanged) currentTicket.status_changed_at = new Date().toISOString(); // 서버도 상태 변경 시에만 갱신
      renderDoneDate(currentTicket);
    }

    // 삭제 예정 Drive 파일 정리
    if (removedFileUrls.length > 0) {
      try { await trashDriveFiles(removedFileUrls); } catch (e) {}
      removedFileUrls = [];
    }

    clearTicketsCaches();  // 저장(신규/수정)으로 내용이 바뀌었으므로 목록 캐시 무효화

    resetDirty();
    setSavingState(false);
    releaseLockKeepId();  // 편집 잠금 해제 (신규 모드는 isLockHeld=false라 no-op)
    // 저장 후에도 화면에 머문다. 잠금은 다음에 바꿀 때 다시 건다.
    enterEditMode(UNLOCK_POLL_DELAY_MS);
    showToast(t('toast_saved'), 'btn-save-top');
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

// 완료 일시 — 상태가 '완료'일 때만 표시(그 외 '-'). 서버의 status_changed_at(마지막 상태 변경 시각)을 사용
function renderDoneDate(ticket) {
  const grp = document.getElementById('done-date-group');
  if (grp) grp.style.display = '';
  const isDone = ticket && ticket.status === '완료' && ticket.status_changed_at;
  document.getElementById('done-date').textContent = isDone ? formatDate(ticket.status_changed_at) : '-';
}

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

// "버전 N - 테스트/비교 버전" 형태의 라벨·플레이스홀더 문구 생성
function versionLabelText(base, el) {
  const num  = el.dataset.versionNum;
  if (!num) return base;
  const kind = el.dataset.versionKind;
  const kindText = kind ? t('version_kind_' + kind) : '';
  return base + ' ' + num + (kindText ? ' - ' + kindText : '');
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const base = t(el.dataset.i18nPlaceholder);
    el.placeholder = versionLabelText(base, el);
  });
  document.querySelectorAll('[data-i18n-version-label]').forEach(el => {
    const base = t(el.dataset.i18nVersionLabel);
    el.textContent = versionLabelText(base, el);
  });
  document.title = t('app_title');
}

// ─── 토스트 ───────────────────────────────────────────────────────────────────

let _toastTimer = null;
// anchorId 지정 시: 그 버튼 바로 아래에 초록색(성공)으로 표시
function showToast(msg, anchorId) {
  let el = document.getElementById('app-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-toast';
    el.className = 'app-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.toggle('app-toast-ok', !!anchorId);

  const anchor = anchorId && document.getElementById(anchorId);
  if (anchor) {
    const a = anchor.getBoundingClientRect();
    el.style.left = (a.left + a.width / 2) + 'px';
    el.style.top  = (a.bottom + 28) + 'px';
    el.style.maxWidth = '';
  }

  // 버튼 중앙 X, 카드 상단~버튼 상단 중간 Y에 배치
  const btn  = document.getElementById('btn-wjira-link');
  const card = document.querySelector('.detail-card');
  if (!anchor && btn && card) {
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
