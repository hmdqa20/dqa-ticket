const GAS_URL = 'https://script.google.com/macros/s/AKfycbzl3UgVMiLvHaUgBXCmL0xF61xAfN1Ua5r000HJzlK9cXs7L0270JBMrf_D8RbKifwfJQ/exec';

// POST 공통 함수 — URLSearchParams로 form-encoded 전송
async function callGAS(type, params = {}) {
  const body = new URLSearchParams({ type, ...params });
  const res = await fetch(GAS_URL, {
    method: 'POST',
    body,
    redirect: 'follow'
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '알 수 없는 오류');
  return json;
}

// 전체 티켓 조회 (doGet)
async function getTickets() {
  const res = await fetch(GAS_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '알 수 없는 오류');
  return json.data;
}

// 티켓 추가
async function addTicket(data) {
  return callGAS('addTicket', data);
}

// 티켓 수정
async function updateTicket(data) {
  return callGAS('updateTicket', data);
}

// JIRA 이슈 조회
async function fetchJira(ticketId) {
  return callGAS('fetchJira', { ticketId });
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
