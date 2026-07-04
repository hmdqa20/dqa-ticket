const GAS_URL = 'https://script.google.com/macros/s/AKfycbwIgVHDvVDcS1A6zyopK9NebKD0e2qdWDhLTaK3gR_DY5dQlvE5dLUiv_i89_-TW3QJ7A/exec';

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
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const json = await res.json();
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

// 티켓을 다른 버전으로 이동
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
