const GAS_URL = 'https://script.google.com/macros/s/AKfycbxhss5aowNfQZ-TI8Rf9cYHnhDPBWHce-Bnp6aLqWAFuZwPuY-SSc6o9_NzxCdkhj6i7A/exec';

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

// 버전 추가
async function addVersion(versionName) {
  return callGAS('addVersion', { version_name: versionName });
}

// 버전 수정 (version_name, sort_order, status 중 변경 필드만 전달)
async function updateVersion(data) {
  return callGAS('updateVersion', data);
}

// 버전 삭제 (소속 티켓 version_id 초기화)
async function deleteVersion(versionId) {
  return callGAS('deleteVersion', { version_id: versionId });
}

// 티켓을 다른 버전으로 이동 (priority 지정 시 그 값으로 세팅 — 일괄이동용)
async function moveTicket(rowId, targetVersionId, priority) {
  const params = { row_id: rowId, target_version_id: targetVersionId };
  if (priority !== undefined) params.priority = priority;
  return callGAS('moveTicket', params);
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
