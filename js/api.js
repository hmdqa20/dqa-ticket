const GAS_URL = 'https://script.google.com/macros/s/AKfycbwULFEhn_BEJVoYKE8Ki4XPJ2VtBFj7q3klc2TSQT1oKGQjzPRDIueM0t46IZWIu7DCCA/exec';

// CLAUDE.md에 기록된 "회사 계정 배포"(운영) URL — GAS_URL이 이 값과 다르면 테스트 모드로 간주
const PROD_GAS_URL = 'https://script.google.com/macros/s/AKfycbwIgVHDvVDcS1A6zyopK9NebKD0e2qdWDhLTaK3gR_DY5dQlvE5dLUiv_i89_-TW3QJ7A/exec';
const IS_TEST_MODE = GAS_URL !== PROD_GAS_URL;

// 테스트 모드 배너 — index.html/detail.html/versions.html 등 api.js를 불러오는 모든 화면에 공통 적용.
// 운영 URL이면 IS_TEST_MODE가 false라 아예 DOM에 삽입하지 않음(레이아웃 영향 0).
document.addEventListener('DOMContentLoaded', () => {
  if (!IS_TEST_MODE) return;
  const banner = document.createElement('div');
  banner.id = 'test-mode-banner';
  banner.textContent = '⚠️ 테스트 모드 - 실제 데이터 아님';
  document.body.prepend(banner);
});

// ─── 티켓 데이터 세션 캐시 (stale-while-revalidate) ──────────────────────────
// GAS 콜드스타트(수 초)를 매 페이지 이동마다 기다리지 않도록, 마지막으로 받은 티켓 데이터를
// sessionStorage에 저장해 두고 다음 진입 시 즉시 그린 뒤 백그라운드에서 최신 데이터로 갈아끼운다.
// 캐시는 탭 단위(sessionStorage)라 탭을 닫으면 사라지고, 저장/삭제 등 변경 시 비워서 정합성 유지.
const TICKETS_CACHE_PREFIX = 'dqa_cache_tickets:';

function saveTicketsCache(versionId, data) {
  try {
    sessionStorage.setItem(TICKETS_CACHE_PREFIX + (versionId || '__ALL__'), JSON.stringify(data));
  } catch (_) { /* 용량 초과 등은 무시 — 캐시는 없어도 동작에 지장 없음 */ }
}

function loadTicketsCache(versionId) {
  try {
    const raw = sessionStorage.getItem(TICKETS_CACHE_PREFIX + (versionId || '__ALL__'));
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function clearTicketsCaches() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(TICKETS_CACHE_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch (_) {}
}

// 저장된 모든 캐시에서 row_id로 티켓 탐색 — detail 진입 시 즉시 렌더용.
// 반환: { ticket, data } (data = 그 티켓이 들어있던 응답 전체, versions 포함) / 없으면 null
function findTicketInCaches(rowId) {
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key || !key.startsWith(TICKETS_CACHE_PREFIX)) continue;
      const data = JSON.parse(sessionStorage.getItem(key));
      const all = [...(data.activeWW || []), ...(data.activeMVN || []), ...(data.done || []), ...(data.hold || [])];
      const found = all.find(tk => tk.row_id === rowId);
      if (found) return { ticket: found, data };
    }
  } catch (_) {}
  return null;
}

// 신규 등록 진입용: 지정 버전 캐시 → 전체 캐시 → 아무 캐시 순으로 반환
function loadAnyTicketsCache(preferredVersionId) {
  const preferred = loadTicketsCache(preferredVersionId);
  if (preferred) return preferred;
  const all = loadTicketsCache('');
  if (all) return all;
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(TICKETS_CACHE_PREFIX)) {
        return JSON.parse(sessionStorage.getItem(key));
      }
    }
  } catch (_) {}
  return null;
}

// POST 공통 함수 — URLSearchParams로 form-encoded 전송
async function callGAS(type, params = {}) {
  const body = new URLSearchParams({ type, ...params });
  const res = await fetch(GAS_URL, {
    method: 'POST',
    body,
    redirect: 'follow'
  });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`GAS가 JSON이 아닌 응답을 반환했습니다 (${res.status}). 배포 설정 또는 스크립트 권한을 확인하세요.`);
  }
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '알 수 없는 오류');
  return json;
}

// 전체 티켓 조회 (doGet) — versionId 주면 해당 버전 티켓만 / versions도 함께 반환
async function getTickets(versionId) {
  const url = versionId ? `${GAS_URL}?version_id=${encodeURIComponent(versionId)}` : GAS_URL;

  let res;
  try {
    res = await fetch(url, { redirect: 'follow' });
  } catch (networkErr) {
    console.error('[getTickets] 네트워크 오류:', networkErr);
    throw new Error('네트워크 오류 — 인터넷 연결을 확인하세요.');
  }

  if (!res.ok) {
    console.error('[getTickets] HTTP 오류:', res.status, res.statusText);
    throw new Error(`서버 오류 (HTTP ${res.status})`);
  }

  let json;
  try {
    json = await res.json();
  } catch (parseErr) {
    console.error('[getTickets] 응답 형식 오류:', parseErr);
    throw new Error('응답 형식 오류 — GAS 배포 설정을 확인하세요.');
  }

  if (!json.success) throw new Error(json.error || '알 수 없는 오류');
  return { ...(json.data || {}), versions: json.versions || [] };
}

// 버전 목록 조회
async function getVersions() {
  const json = await callGAS('getVersions', {});
  return json.versions || [];
}

// 버전 추가 (버전 구조가 바뀌므로 티켓 캐시 무효화)
async function addVersion(versionName) {
  const result = await callGAS('addVersion', { version_name: versionName });
  clearTicketsCaches();
  return result;
}

// 버전 수정 (version_name, sort_order, status 중 변경 필드만 전달)
async function updateVersion(data) {
  const result = await callGAS('updateVersion', data);
  clearTicketsCaches();
  return result;
}

// 버전 삭제 (소속 티켓 version_id 초기화)
async function deleteVersion(versionId) {
  const result = await callGAS('deleteVersion', { version_id: versionId });
  clearTicketsCaches();
  return result;
}

// 티켓을 다른 버전으로 이동 (실시순서는 항상 초기화)
async function moveTicket(rowId, targetVersionId) {
  return callGAS('moveTicket', { row_id: rowId, target_version_id: targetVersionId });
}

// 티켓 추가
async function addTicket(data) {
  return callGAS('addTicket', data);
}

// 티켓 수정
async function updateTicket(data) {
  return callGAS('updateTicket', data);
}

// 티켓 삭제
async function deleteTicket(rowId) {
  return callGAS('deleteTicket', { row_id: rowId });
}

// Drive 파일 휴지통 이동 (URL 배열)
async function trashDriveFiles(urls) {
  return callGAS('trashFiles', { file_urls: urls.join(',') });
}

// JIRA 이슈 조회
async function fetchJira(ticketId) {
  return callGAS('fetchJira', { ticketId });
}

// 티켓 편집 잠금 (locked: true = 이미 잠김, false = 잠금 성공)
async function lockTicket(rowId) {
  return callGAS('lockTicket', { row_id: rowId });
}

// 티켓 편집 잠금 해제
async function unlockTicket(rowId) {
  return callGAS('unlockTicket', { row_id: rowId });
}

// 티켓 잠금 상태 확인
async function checkLock(rowId) {
  return callGAS('checkLock', { row_id: rowId });
}

// 편집 잠금 heartbeat — 편집 중 주기적으로 호출해 LOCKED_AT 갱신(잠금 유지)
async function heartbeat(rowId) {
  return callGAS('heartbeat', { row_id: rowId });
}

// 파일 업로드 — File 객체를 받아 base64로 변환 후 전송
async function uploadFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        // data:mime/type;base64,XXXX 형식에서 base64 부분만 추출
        const base64Data = e.target.result.split(',')[1];
        const result = await callGAS('uploadFile', {
          base64Data,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream'
        });
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsDataURL(file);
  });
}
