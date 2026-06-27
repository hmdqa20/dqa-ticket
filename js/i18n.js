// 다국어 번역 테이블
const I18N = {
  ko: {
    app_title: 'DQA Ticket Manager',
    new_ticket: '티켓 등록',
    search_placeholder: '티켓번호/이슈명/확인버전/담당자 검색...',
    section_activeWW: 'WW',
    section_activeMVN: 'MVN',
    section_done: '완료',
    section_hold: '보류 / N/A',
    col_ticket_id: '티켓번호',
    col_title: '이슈명',
    col_check_version: '확인버전',
    col_assignee: '담당자',
    col_order: '실시순서',
    col_status: '진행상태',
    col_verdict: '결과',
    col_wjira: 'WJIRA 결과기재',
    btn_retry: '재시도',
    btn_back: '← 목록',
    btn_save: '저장',
    btn_cancel: '취소',
    btn_fetch: '가져오기',
    loading: '로딩 중...',
    error_load: '데이터를 불러오지 못했습니다.',
    label_ticket_id: '티켓번호',
    label_title: '이슈명',
    label_created_date: '등록날짜',
    label_check_version: '확인버전',
    label_assignee: '담당자',
    label_priority: '실시순서',
    label_status: '진행상태',
    label_verdict: '결과',
    label_check_content: '확인내용',
    label_files: '파일 첨부',
    label_note: '비고',
    label_wjira: 'WJIRA 결과기재',
    page_title_new: '티켓 등록',
    page_title_edit: '티켓 상세',
    drag_drop: '파일을 드래그하거나 클릭하여 업로드',
    uploading: '업로드 중...',
    save_error: '저장에 실패했습니다.',
    no_tickets: '티켓이 없습니다.',
    tickets_count: '건',
    status_active: '진행중',
    status_pending: '진행전',
    status_retest: '재테스트',
    status_done_opt: '완료',
    status_hold_opt: '보류',
    status_na: 'N/A',
    btn_wjira_link: '바로가기',
    btn_clone: '복제',
    badge_retest: '재테스트',
    placeholder_version: '버전',
    placeholder_check_content: '확인내용을 입력하세요',
    placeholder_note: '비고를 입력하세요',
    version_all: '전체',
    btn_add_version: '+ 새 버전',
    btn_confirm: '확인',
    placeholder_version_name: '버전명 입력',
    move_to: '이동',
    move_no_target: '이동할 버전이 없습니다',
    label_version_move: '버전 이동',
    label_progress_info: '진행 정보',
  },
  jp: {
    app_title: 'DQA チケット管理',
    new_ticket: 'チケット登録',
    search_placeholder: 'チケット/課題名/バージョン/担当者...',
    section_activeWW: 'WW',
    section_activeMVN: 'MVN',
    section_done: '完了',
    section_hold: '保留 / N/A',
    col_ticket_id: 'チケット番号',
    col_title: '課題名',
    col_check_version: '確認バージョン',
    col_assignee: '担当者',
    col_order: '実施順序',
    col_status: '進行状態',
    col_verdict: '判定',
    col_wjira: 'WJIRA更新',
    btn_retry: '再試行',
    btn_back: '← 一覧',
    btn_save: '保存',
    btn_cancel: 'キャンセル',
    btn_fetch: '取得',
    loading: '読み込み中...',
    error_load: 'データの読み込みに失敗しました。',
    label_ticket_id: 'チケット番号',
    label_title: '課題名',
    label_created_date: '登録日',
    label_check_version: '確認バージョン',
    label_assignee: '担当者',
    label_priority: '実施順序',
    label_status: '進行状態',
    label_verdict: '判定',
    label_check_content: '確認内容',
    label_files: 'ファイル添付',
    label_note: '備考',
    label_wjira: 'WJIRA更新',
    page_title_new: 'チケット登録',
    page_title_edit: 'チケット詳細',
    drag_drop: 'ファイルをドラッグまたはクリックしてアップロード',
    uploading: 'アップロード中...',
    save_error: '保存に失敗しました。',
    no_tickets: 'チケットがありません。',
    tickets_count: '件',
    status_active: '進行中',
    status_pending: '進行前',
    status_retest: '再テスト',
    status_done_opt: '完了',
    status_hold_opt: '保留',
    status_na: 'N/A',
    btn_wjira_link: '移動',
    btn_clone: '複製',
    badge_retest: '再テスト',
    placeholder_version: 'バージョン',
    placeholder_check_content: '確認内容を入力してください',
    placeholder_note: '備考を入力してください',
    version_all: '全体',
    btn_add_version: '+ 新バージョン',
    btn_confirm: '確認',
    placeholder_version_name: 'バージョン名入力',
    move_to: '移動',
    move_no_target: '移動先のバージョンがありません',
    label_version_move: 'バージョン移動',
    label_progress_info: '進捗情報',
  },
  en: {
    app_title: 'DQA Ticket Manager',
    new_ticket: 'Register',
    search_placeholder: 'Ticket/Title/Version/Assignee...',
    section_activeWW: 'WW',
    section_activeMVN: 'MVN',
    section_done: 'Done',
    section_hold: 'Hold / N/A',
    col_ticket_id: 'Ticket ID',
    col_title: 'Title',
    col_check_version: 'Version',
    col_assignee: 'Assignee',
    col_order: 'Order',
    col_status: 'Status',
    col_verdict: 'Verdict',
    col_wjira: 'WJIRA Updated',
    btn_retry: 'Retry',
    btn_back: '← List',
    btn_save: 'Save',
    btn_cancel: 'Cancel',
    btn_fetch: 'Fetch',
    loading: 'Loading...',
    error_load: 'Failed to load data.',
    label_ticket_id: 'Ticket ID',
    label_title: 'Title',
    label_created_date: 'Registered',
    label_check_version: 'Check Version',
    label_assignee: 'Assignee',
    label_priority: 'Order',
    label_status: 'Status',
    label_verdict: 'Verdict',
    label_check_content: 'Check Content',
    label_files: 'Attachments',
    label_note: 'Note',
    label_wjira: 'WJIRA Updated',
    page_title_new: 'Register',
    page_title_edit: 'Detail',
    drag_drop: 'Drag & drop or click to upload',
    uploading: 'Uploading...',
    save_error: 'Failed to save.',
    no_tickets: 'No tickets.',
    tickets_count: '',
    status_active: 'In Progress',
    status_pending: 'Not Started',
    status_retest: 'Retest',
    status_done_opt: 'Done',
    status_hold_opt: 'Hold',
    status_na: 'N/A',
    btn_wjira_link: 'Go',
    btn_clone: 'Clone',
    badge_retest: 'Retest',
    placeholder_version: 'Version',
    placeholder_check_content: 'Enter check content',
    placeholder_note: 'Enter note',
    version_all: 'All',
    btn_add_version: '+ New Version',
    btn_confirm: 'OK',
    placeholder_version_name: 'Version name',
    move_to: 'Move',
    move_no_target: 'No version to move to',
    label_version_move: 'Move Version',
    label_progress_info: 'Progress Info',
  },
  vi: {
    app_title: 'Quản lý vé DQA',
    new_ticket: 'Đăng ký vé',
    search_placeholder: 'Mã/Tiêu đề/Phiên bản/Người phụ trách...',
    section_activeWW: 'WW',
    section_activeMVN: 'MVN',
    section_done: 'Hoàn thành',
    section_hold: 'Tạm giữ / N/A',
    col_ticket_id: 'Mã vé',
    col_title: 'Tiêu đề',
    col_check_version: 'Phiên bản',
    col_assignee: 'Người phụ trách',
    col_order: 'Thứ tự',
    col_status: 'Trạng thái',
    col_verdict: 'Kết quả',
    col_wjira: 'Cập nhật WJIRA',
    btn_retry: 'Thử lại',
    btn_back: '← Danh sách',
    btn_save: 'Lưu',
    btn_cancel: 'Hủy',
    btn_fetch: 'Lấy',
    loading: 'Đang tải...',
    error_load: 'Không thể tải dữ liệu.',
    label_ticket_id: 'Mã vé',
    label_title: 'Tiêu đề',
    label_created_date: 'Ngày đăng ký',
    label_check_version: 'Phiên bản kiểm tra',
    label_assignee: 'Người phụ trách',
    label_priority: 'Thứ tự',
    label_status: 'Trạng thái',
    label_verdict: 'Kết quả',
    label_check_content: 'Nội dung kiểm tra',
    label_files: 'Tệp đính kèm',
    label_note: 'Ghi chú',
    label_wjira: 'Cập nhật WJIRA',
    page_title_new: 'Đăng ký',
    page_title_edit: 'Chi tiết',
    drag_drop: 'Kéo thả hoặc nhấp để tải lên',
    uploading: 'Đang tải lên...',
    save_error: 'Lưu thất bại.',
    no_tickets: 'Không có vé.',
    tickets_count: '',
    status_active: 'Đang tiến hành',
    status_pending: 'Chưa bắt đầu',
    status_retest: 'Kiểm tra lại',
    status_done_opt: 'Hoàn thành',
    status_hold_opt: 'Tạm giữ',
    status_na: 'N/A',
    btn_wjira_link: 'Đến trang',
    btn_clone: 'Nhân bản',
    badge_retest: 'Kiểm tra lại',
    placeholder_version: 'Phiên bản',
    placeholder_check_content: 'Nhập nội dung kiểm tra',
    placeholder_note: 'Nhập ghi chú',
    version_all: 'Tất cả',
    btn_add_version: '+ Phiên bản mới',
    btn_confirm: 'OK',
    placeholder_version_name: 'Tên phiên bản',
    move_to: 'Di chuyển',
    move_no_target: 'Không có phiên bản để di chuyển',
    label_version_move: 'Chuyển phiên bản',
    label_progress_info: 'Thông tin tiến độ',
  }
};

// 현재 언어 반환
function getLang() {
  return localStorage.getItem('dqa_lang') || 'ko';
}

// 키로 번역 문자열 반환 (없으면 ko fallback)
function t(key) {
  const lang = getLang();
  return (I18N[lang] && I18N[lang][key] !== undefined)
    ? I18N[lang][key]
    : (I18N.ko[key] !== undefined ? I18N.ko[key] : key);
}

// 언어 변경 후 페이지 새로고침
function setLang(lang) {
  localStorage.setItem('dqa_lang', lang);
  location.reload();
}

// 언어 드롭다운 초기화
const LANG_META = {
  ko: { flag: 'fi-kr', label: 'KO', name: '한국어' },
  jp: { flag: 'fi-jp', label: 'JP', name: '日本語' },
  en: { flag: 'fi-gb', label: 'EN', name: 'English' },
  vi: { flag: 'fi-vn', label: 'VI', name: 'Tiếng Việt' },
};

function initLangDropdown() {
  const btn  = document.getElementById('lang-dropdown-btn');
  const menu = document.getElementById('lang-dropdown-menu');
  if (!btn || !menu) return;

  const lang = getLang();
  const m = LANG_META[lang] || LANG_META.ko;
  btn.innerHTML = `<span class="fi ${m.flag}"></span><span>${m.label}</span><span class="lang-arrow">▼</span>`;

  btn.addEventListener('click', e => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });

  menu.querySelectorAll('[data-lang]').forEach(opt => {
    if (opt.dataset.lang === lang) opt.classList.add('active');
    opt.addEventListener('click', () => setLang(opt.dataset.lang));
  });

  document.addEventListener('click', () => menu.classList.remove('open'));
}

document.addEventListener('DOMContentLoaded', initLangDropdown);

// ─── 실시순서 충돌 확인 (공유) ─────────────────────────────────────────────────
const SKIP_CASCADE_KEY = 'dqa_skip_cascade_until';

function isCascadeSkippedToday() {
  const until = localStorage.getItem(SKIP_CASCADE_KEY);
  if (!until) return false;
  return new Date().toISOString().slice(0, 10) === until;
}

function confirmCascade(msg) {
  return new Promise(resolve => {
    const overlay    = document.getElementById('cascade-modal');
    const msgEl      = document.getElementById('cascade-msg');
    const skip       = document.getElementById('cascade-skip-today');
    const okBtn      = document.getElementById('cascade-ok');
    const cancelBtn  = document.getElementById('cascade-cancel');

    msgEl.textContent = msg;
    skip.checked = false;
    overlay.style.display = 'flex';

    function close(result) {
      overlay.style.display = 'none';
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onOk() {
      if (skip.checked) localStorage.setItem(SKIP_CASCADE_KEY, new Date().toISOString().slice(0, 10));
      close(true);
    }
    function onCancel() { close(false); }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}
