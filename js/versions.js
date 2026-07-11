// 버전 목록과 티켓 수를 담는 상태
let versionList = [];      // sort_order 기준 정렬 유지
let ticketCounts = {};     // { version_id: count }
let originalOrder = [];    // 페이지 로드(또는 저장) 시 version_id 순서 스냅샷
let isDirtyOrder  = false; // 드래그로 순서가 변경된 상태
let dragSrcRow    = null;  // 현재 드래그 중인 행 참조

// 정렬 상태 (페이지 메모리에서만 관리, DB 저장 안 함)
let sortState = { col: null, dir: 'asc' }; // col: 'name'|'count'|'date'|null

// ─── 초기화 ──────────────────────────────────────────────────────────────────

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  applyTranslations();
  onLangChange(applyTranslations);

  document.getElementById('btn-back').addEventListener('click', () => {
    location.href = 'index.html';
  });

  document.getElementById('btn-add-ver').addEventListener('click', handleAdd);
  document.getElementById('new-version-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAdd();
  });

  // 헤더 클릭 정렬
  document.querySelectorAll('.ver-th-sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortState.col === col) {
        // 같은 컬럼 재클릭: 방향 토글, 두 번째 클릭 후 세 번째 클릭은 정렬 해제
        if (sortState.dir === 'desc') {
          sortState.col = null; // 정렬 해제
        } else {
          sortState.dir = 'desc';
        }
      } else {
        sortState.col = col;
        sortState.dir = 'asc';
      }
      renderTable();
    });
  });

  document.getElementById('btn-reset-order').addEventListener('click', handleResetOrder);
  document.getElementById('btn-save-order').addEventListener('click', handleSaveOrder);

  await loadData();
});

// ─── 데이터 로드 ──────────────────────────────────────────────────────────────

async function loadData() {
  showLoading(true);
  try {
    // 티켓과 버전 목록을 1회 API 호출로 동시 취득
    const allTickets = await getTickets();
    const vers = allTickets.versions || [];

    // versionList는 항상 sort_order 기준 유지 (드래그 순서 이동을 위해)
    versionList   = vers;
    originalOrder = versionList.map(v => v.version_id);

    // 버전별 티켓 수 집계
    const flat = [
      ...allTickets.activeWW,
      ...allTickets.activeMVN,
      ...allTickets.done,
      ...allTickets.hold
    ];
    ticketCounts = {};
    flat.forEach(tk => {
      const vid = tk.version_id || '';
      ticketCounts[vid] = (ticketCounts[vid] || 0) + 1;
    });

    renderTable();
  } catch (err) {
    alert('데이터 로드 실패: ' + err.message);
  } finally {
    showLoading(false);
  }
}

// ─── 정렬 ─────────────────────────────────────────────────────────────────────

// 현재 sortState에 따라 표시용 배열 반환 (versionList 원본 불변)
function getSortedDisplay() {
  if (!sortState.col) return [...versionList];

  return [...versionList].sort((a, b) => {
    let va, vb;
    if (sortState.col === 'name') {
      va = a.version_name.toLowerCase();
      vb = b.version_name.toLowerCase();
    } else if (sortState.col === 'count') {
      va = ticketCounts[a.version_id] || 0;
      vb = ticketCounts[b.version_id] || 0;
    } else if (sortState.col === 'date') {
      va = a.created_at || '';
      vb = b.created_at || '';
    }
    if (va < vb) return sortState.dir === 'asc' ? -1 : 1;
    if (va > vb) return sortState.dir === 'asc' ? 1 : -1;
    return 0;
  });
}

// 헤더 정렬 아이콘 갱신: 기본 ↕ (연회색) / 활성 ▲▼ (파란색)
function updateSortHeaders() {
  document.querySelectorAll('.ver-th-sortable').forEach(th => {
    const icon = th.querySelector('.ver-sort-icon');
    if (!icon) return;
    if (sortState.col === th.dataset.col) {
      icon.textContent = sortState.dir === 'asc' ? ' ▲' : ' ▼';
      th.classList.add('ver-th-active');
    } else {
      icon.textContent = ' ↕';
      icon.classList.add('ver-sort-default');
      th.classList.remove('ver-th-active');
    }
  });
}

// ─── 테이블 렌더링 ────────────────────────────────────────────────────────────

function renderTable() {
  const tbody = document.getElementById('ver-tbody');
  if (!tbody) return;

  updateSortHeaders();
  updateHint();

  if (versionList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="ver-empty">버전이 없습니다.</td></tr>';
    return;
  }

  // 표시 순서는 sortState 기준, 드래그 가능 여부는 정렬 상태에 따라 결정
  const displayList  = getSortedDisplay();
  const isSorted     = sortState.col !== null;
  tbody.innerHTML    = displayList.map(v => buildRow(v, isSorted)).join('');

  // 이벤트 연결
  tbody.querySelectorAll('.btn-ver-edit').forEach(btn =>
    btn.addEventListener('click', () => handleEditStart(btn.dataset.id)));
  tbody.querySelectorAll('.btn-ver-save').forEach(btn =>
    btn.addEventListener('click', () => handleEditSave(btn.dataset.id)));
  tbody.querySelectorAll('.btn-ver-cancel').forEach(btn =>
    btn.addEventListener('click', () => renderTable()));
  tbody.querySelectorAll('.btn-ver-delete').forEach(btn =>
    btn.addEventListener('click', () => handleDelete(btn.dataset.id)));

  // 정렬 상태가 아닐 때만 드래그 앤 드롭 활성화
  if (!isSorted) setupDragDrop(tbody);
}

function buildRow(v, isSorted) {
  const count   = ticketCounts[v.version_id] || 0;
  const dateStr = v.created_at ? v.created_at.substring(0, 10) : '—';

  return `
    <tr data-id="${escHtml(v.version_id)}" ${isSorted ? '' : 'draggable="true"'}>
      <td class="ver-name-cell">
        <span class="ver-name-text">${escHtml(v.version_name)}</span>
      </td>
      <td class="ver-count-cell ver-col-center">${count}</td>
      <td class="ver-date-cell ver-col-center">${dateStr}</td>
      <td class="ver-action-cell ver-col-center">
        <button class="btn btn-secondary btn-sm btn-ver-edit" data-id="${escHtml(v.version_id)}">수정</button>
        <button class="btn btn-danger btn-sm btn-ver-delete" data-id="${escHtml(v.version_id)}">삭제</button>
      </td>
      <td class="ver-handle-cell">
        <span class="ver-drag-handle ${isSorted ? 'ver-drag-disabled' : ''}">⠿</span>
      </td>
    </tr>`;
}

// 하단 안내 문구 갱신 (정렬 중일 때 경고 문구로 교체)
function updateHint() {
  const hint = document.getElementById('ver-hint');
  if (!hint) return;
  if (sortState.col) {
    hint.textContent = '⚠ 정렬 상태에서는 드래그 비활성 — 컬럼 헤더를 다시 클릭해 정렬 해제 후 드래그 가능';
    hint.classList.add('ver-hint-warn');
  } else {
    hint.textContent = '⠿ 핸들을 드래그해서 순서 변경 · 헤더 클릭으로 임시 정렬 (정렬 중 드래그 비활성)';
    hint.classList.remove('ver-hint-warn');
  }
}

// ─── 드래그 앤 드롭 ───────────────────────────────────────────────────────────

function setupDragDrop(tbody) {
  tbody.querySelectorAll('tr[draggable]').forEach(row => {
    row.addEventListener('dragstart', onDragStart);
    row.addEventListener('dragend',   onDragEnd);
  });
  tbody.addEventListener('dragover',  onDragOver);
  tbody.addEventListener('dragleave', onDragLeave);
  tbody.addEventListener('drop',      onDrop);
}

function onDragStart(e) {
  dragSrcRow = e.currentTarget;
  dragSrcRow.classList.add('ver-row-dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSrcRow.dataset.id);
}

function onDragEnd() {
  if (dragSrcRow) dragSrcRow.classList.remove('ver-row-dragging');
  clearDropIndicator();
  dragSrcRow = null;
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const targetRow = e.target.closest('tr[draggable]');
  if (!targetRow || targetRow === dragSrcRow) return;

  clearDropIndicator();
  const rect     = targetRow.getBoundingClientRect();
  const isBefore = e.clientY < rect.top + rect.height / 2;
  targetRow.classList.add(isBefore ? 'ver-drop-above' : 'ver-drop-below');
}

function onDragLeave(e) {
  const tbody = document.getElementById('ver-tbody');
  // tbody 밖으로 나갈 때만 인디케이터 제거
  if (!tbody.contains(e.relatedTarget)) clearDropIndicator();
}

function onDrop(e) {
  e.preventDefault();
  const targetRow = e.target.closest('tr[draggable]');
  if (!targetRow || !dragSrcRow || targetRow === dragSrcRow) {
    clearDropIndicator();
    return;
  }

  const tbody    = document.getElementById('ver-tbody');
  const rect     = targetRow.getBoundingClientRect();
  const isBefore = e.clientY < rect.top + rect.height / 2;

  clearDropIndicator();

  // DOM 행 이동
  if (isBefore) {
    tbody.insertBefore(dragSrcRow, targetRow);
  } else {
    tbody.insertBefore(dragSrcRow, targetRow.nextSibling);
  }

  // 이동된 행 초록 하이라이트 후 제거
  const movedRow = dragSrcRow;
  movedRow.classList.add('ver-row-moved');
  setTimeout(() => movedRow.classList.remove('ver-row-moved'), 1500);

  setOrderDirty(true);
}

function clearDropIndicator() {
  document.querySelectorAll('.ver-drop-above, .ver-drop-below').forEach(el => {
    el.classList.remove('ver-drop-above', 'ver-drop-below');
  });
}

// ─── 순서 변경 상태 관리 ──────────────────────────────────────────────────────

function setOrderDirty(dirty) {
  isDirtyOrder = dirty;
  const badge    = document.getElementById('ver-changed-badge');
  const btnReset = document.getElementById('btn-reset-order');
  const btnSave  = document.getElementById('btn-save-order');
  if (badge)    badge.style.display = dirty ? '' : 'none';
  if (btnReset) btnReset.disabled   = !dirty;
  if (btnSave)  btnSave.disabled    = !dirty;
  if (btnSave)  btnSave.classList.toggle('ver-btn-save-active', dirty);
}

// ↺ 원래대로: originalOrder 기준으로 행 재배치
function handleResetOrder() {
  const tbody = document.getElementById('ver-tbody');
  originalOrder.forEach(versionId => {
    const row = tbody.querySelector(`tr[data-id="${CSS.escape(versionId)}"]`);
    if (row) tbody.appendChild(row);
  });
  setOrderDirty(false);
}

// 💾 순서 저장: 현재 DOM 행 순서 → sort_order 재계산 → DB 저장
async function handleSaveOrder() {
  const tbody    = document.getElementById('ver-tbody');
  const rows     = Array.from(tbody.querySelectorAll('tr[data-id]'));
  const newOrder = rows.map((row, idx) => ({
    version_id: row.dataset.id,
    sort_order: idx + 1
  }));

  showLoading(true);
  try {
    // 각 버전의 sort_order를 병렬로 저장
    await Promise.all(newOrder.map(({ version_id, sort_order }) =>
      updateVersion({ version_id, sort_order: String(sort_order) })
    ));

    // 로컬 versionList sort_order 갱신 후 재정렬
    newOrder.forEach(({ version_id, sort_order }) => {
      const v = versionList.find(x => x.version_id === version_id);
      if (v) v.sort_order = sort_order;
    });
    versionList.sort((a, b) => a.sort_order - b.sort_order);

    // originalOrder를 현재 저장된 순서로 갱신
    originalOrder = versionList.map(v => v.version_id);
    setOrderDirty(false);
  } catch (err) {
    alert('순서 저장 실패: ' + err.message);
  } finally {
    showLoading(false);
  }
}

// ─── 인라인 편집 ──────────────────────────────────────────────────────────────

function handleEditStart(versionId) {
  const v = versionList.find(x => x.version_id === versionId);
  if (!v) return;

  const row = document.querySelector(`tr[data-id="${CSS.escape(versionId)}"]`);
  if (!row) return;

  // 버전명 셀 → input으로 전환
  const nameCell = row.querySelector('.ver-name-cell');
  nameCell.innerHTML = `<input type="text" class="ver-name-input ver-edit-input" value="${escHtml(v.version_name)}" maxlength="50">`;
  nameCell.querySelector('input').focus();

  // 작업 버튼 → 저장/취소로 전환
  const actionCell = row.querySelector('.ver-action-cell');
  actionCell.innerHTML = `
    <button class="btn btn-primary btn-sm btn-ver-save" data-id="${escHtml(versionId)}">저장</button>
    <button class="btn btn-ghost btn-sm btn-ver-cancel" data-id="${escHtml(versionId)}">취소</button>`;

  actionCell.querySelector('.btn-ver-save').addEventListener('click', () => handleEditSave(versionId));
  actionCell.querySelector('.btn-ver-cancel').addEventListener('click', () => renderTable());

  nameCell.querySelector('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  handleEditSave(versionId);
    if (e.key === 'Escape') renderTable();
  });
}

async function handleEditSave(versionId) {
  const row   = document.querySelector(`tr[data-id="${CSS.escape(versionId)}"]`);
  if (!row) return;

  const input   = row.querySelector('.ver-edit-input');
  const newName = input ? input.value.trim() : '';
  if (!newName) { input && input.focus(); return; }

  showLoading(true);
  try {
    await updateVersion({ version_id: versionId, version_name: newName });
    const v = versionList.find(x => x.version_id === versionId);
    if (v) v.version_name = newName;
    renderTable();
  } catch (err) {
    alert('수정 실패: ' + err.message);
  } finally {
    showLoading(false);
  }
}

// ─── 삭제 ─────────────────────────────────────────────────────────────────────

async function handleDelete(versionId) {
  const v = versionList.find(x => x.version_id === versionId);
  if (!v) return;

  const count = ticketCounts[versionId] || 0;
  const msg   = count > 0
    ? `[${v.version_name}]을(를) 삭제하시겠습니까?\n소속 티켓 ${count}개의 버전 정보가 초기화됩니다. 티켓 자체는 유지됩니다.`
    : `[${v.version_name}]을(를) 삭제하시겠습니까?`;

  if (!confirm(msg)) return;

  showLoading(true);
  try {
    await deleteVersion(versionId);
    versionList   = versionList.filter(x => x.version_id !== versionId);
    originalOrder = originalOrder.filter(id => id !== versionId);
    delete ticketCounts[versionId];
    if (localStorage.getItem('dqa_current_version') === versionId) {
      localStorage.removeItem('dqa_current_version');
    }
    renderTable();
  } catch (err) {
    alert('삭제 실패: ' + err.message);
  } finally {
    showLoading(false);
  }
}

// ─── 새 버전 추가 ─────────────────────────────────────────────────────────────

async function handleAdd() {
  const input = document.getElementById('new-version-name');
  const name  = input.value.trim();
  if (!name) { input.focus(); return; }

  showLoading(true);
  try {
    await addVersion(name);
    input.value = '';
    await loadData();
  } catch (err) {
    alert('버전 추가 실패: ' + err.message);
  } finally {
    showLoading(false);
  }
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function showLoading(show) {
  document.getElementById('loading').style.display = show ? 'flex' : 'none';
}

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
