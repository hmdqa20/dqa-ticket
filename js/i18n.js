// 다국어 번역 테이블
const I18N = {
  ko: {
    app_title: 'DQA Ticket Manager',
    new_ticket: '티켓 등록',
    search_placeholder: '티켓번호/이슈명/확인버전/담당자 검색...',
    section_activeWW: 'DQA',
    section_activeMVN: 'MVN',
    section_done: '완료',
    section_hold: '보류 & N/A',
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
    btn_save_list: '저장 후 목록으로',
    btn_save_continue: '저장 후 계속 등록',
    btn_delete: '삭제',
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
    label_check_content: '확인결과',
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
    btn_wjira_link: '티켓 바로 가기',
    btn_clone: '복제',
    badge_retest: '재테스트',
    placeholder_version: '버전',
    placeholder_check_content: '확인결과를 입력하세요',
    placeholder_note: '비고를 입력하세요',
    version_all: '전체',
    filter_all: '전체',
    btn_add_version: '+ 새 버전',
    btn_confirm: '확인',
    placeholder_version_name: '버전명 입력',
    move_to: '이동',
    move_no_target: '이동할 버전이 없습니다',
    label_version_move: '버전 이동',
    label_progress_info: '진행 정보',
    label_version_select: '버전 선택',
    skip_today: '오늘 그만 보기',
    label_current: '현재',
    label_unassigned: '미지정',
    label_no_versions: '버전 없음',
    confirm_leave: '저장하지 않은 변경 사항이 있습니다. 페이지를 떠나시겠습니까?',
    error_jira_fetch: 'JIRA 조회 실패: ',
    error_ticket_locked: '다른 사용자가 편집 중인 항목입니다.\n편집이 완료된 후 다시 시도해 주세요.',
    error_move_version: '버전 이동에 실패했습니다: ',
    hint_file_size_limit: '구글 드라이브 공유 용량(15GB) 한도를 고려해, 1GB 이상의 대용량 파일(펌웨어 등)은 직접 올리지 말고 아래 링크 항목을 이용해 주세요.',
    placeholder_link_label: '파일 설명',
    label_links: '링크',
    btn_select_mode: '티켓 이동',
    btn_select_mode_active: '이동 해제',
    bulk_move_btn: '선택한 티켓 이동',
    bulk_target_placeholder: '이동할 버전 선택',
    unit_selected: '개 선택됨',
  },
  jp: {
    app_title: 'DQA チケット管理',
    new_ticket: 'チケット登録',
    search_placeholder: 'チケット/課題名/バージョン/担当者...',
    section_activeWW: 'DQA',
    section_activeMVN: 'MVN',
    section_done: '完了',
    section_hold: '保留 & N/A',
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
    btn_save_list: '保存して一覧へ',
    btn_save_continue: '保存して続けて登録',
    btn_delete: '削除',
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
    label_check_content: '確認結果',
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
    btn_wjira_link: 'チケットへ',
    btn_clone: '複製',
    badge_retest: '再テスト',
    placeholder_version: 'バージョン',
    placeholder_check_content: '確認結果を入力してください',
    placeholder_note: '備考を入力してください',
    version_all: '全体',
    filter_all: '全体',
    btn_add_version: '+ 新バージョン',
    btn_confirm: '確認',
    placeholder_version_name: 'バージョン名入力',
    move_to: '移動',
    move_no_target: '移動先のバージョンがありません',
    label_version_move: 'バージョン移動',
    label_progress_info: '進捗情報',
    label_version_select: 'バージョン選択',
    skip_today: '今日は表示しない',
    label_current: '現在',
    label_unassigned: '未指定',
    label_no_versions: 'バージョンなし',
    confirm_leave: '未保存の変更があります。ページを離れますか？',
    error_jira_fetch: 'JIRA取得失敗: ',
    error_ticket_locked: '他のユーザーが編集中です。\n編集完了後に再試行してください。',
    error_move_version: 'バージョン移動に失敗しました: ',
    hint_file_size_limit: 'Googleドライブの共有容量上限(15GB)にご注意ください。1GB超の大容量ファイル（ファームウェアなど）は直接アップロードせず、下のリンク欄をご利用ください。',
    placeholder_link_label: 'ファイルの説明',
    label_links: 'リンク',
    btn_select_mode: 'チケット移動',
    btn_select_mode_active: '移動解除',
    bulk_move_btn: '選択したチケットを移動',
    bulk_target_placeholder: '移動先バージョンを選択',
    unit_selected: '件選択中',
  },
  en: {
    app_title: 'DQA Ticket Manager',
    new_ticket: 'Register',
    search_placeholder: 'Ticket/Title/Version/Assignee...',
    section_activeWW: 'DQA',
    section_activeMVN: 'MVN',
    section_done: 'Done',
    section_hold: 'Hold & N/A',
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
    btn_save_list: 'Save & Back to List',
    btn_save_continue: 'Save & Add Another',
    btn_delete: 'Delete',
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
    label_check_content: 'Check Result',
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
    btn_wjira_link: 'Open Ticket',
    btn_clone: 'Clone',
    badge_retest: 'Retest',
    placeholder_version: 'Version',
    placeholder_check_content: 'Enter check result',
    placeholder_note: 'Enter note',
    version_all: 'All',
    filter_all: 'All',
    btn_add_version: '+ New Version',
    btn_confirm: 'OK',
    placeholder_version_name: 'Version name',
    move_to: 'Move',
    move_no_target: 'No version to move to',
    label_version_move: 'Move Version',
    label_progress_info: 'Progress Info',
    label_version_select: 'Select Version',
    skip_today: "Don't show today",
    label_current: 'Current',
    label_unassigned: 'Unassigned',
    label_no_versions: 'No versions',
    confirm_leave: 'You have unsaved changes. Leave the page?',
    error_jira_fetch: 'JIRA fetch failed: ',
    error_ticket_locked: 'Another user is editing this item.\nPlease try again after they finish.',
    error_move_version: 'Failed to move version: ',
    hint_file_size_limit: 'Google Drive storage is limited to 15 GB. For large files over 1 GB (e.g. firmware), please use the Links section below instead of uploading here.',
    placeholder_link_label: 'File description',
    label_links: 'Links',
    btn_select_mode: 'Move Tickets',
    btn_select_mode_active: 'Cancel Move',
    bulk_move_btn: 'Move Selected',
    bulk_target_placeholder: 'Select target version',
    unit_selected: ' selected',
  },
  vi: {
    app_title: 'Quản lý vé DQA',
    new_ticket: 'Đăng ký vé',
    search_placeholder: 'Mã/Tiêu đề/Phiên bản/Người phụ trách...',
    section_activeWW: 'DQA',
    section_activeMVN: 'MVN',
    section_done: 'Hoàn thành',
    section_hold: 'Tạm giữ & N/A',
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
    btn_save_list: 'Lưu & Về danh sách',
    btn_save_continue: 'Lưu & Đăng ký tiếp',
    btn_delete: 'Xóa',
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
    label_check_content: 'Kết quả kiểm tra',
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
    btn_wjira_link: 'Đến vé',
    btn_clone: 'Nhân bản',
    badge_retest: 'Kiểm tra lại',
    placeholder_version: 'Phiên bản',
    placeholder_check_content: 'Nhập kết quả kiểm tra',
    placeholder_note: 'Nhập ghi chú',
    version_all: 'Tất cả',
    filter_all: 'Tất cả',
    btn_add_version: '+ Phiên bản mới',
    btn_confirm: 'OK',
    placeholder_version_name: 'Tên phiên bản',
    move_to: 'Di chuyển',
    move_no_target: 'Không có phiên bản để di chuyển',
    label_version_move: 'Chuyển phiên bản',
    label_progress_info: 'Thông tin tiến độ',
    label_version_select: 'Chọn phiên bản',
    skip_today: 'Không hiển thị hôm nay',
    label_current: 'Hiện tại',
    label_unassigned: 'Chưa xác định',
    label_no_versions: 'Không có phiên bản',
    confirm_leave: 'Có thay đổi chưa lưu. Bạn có muốn rời trang không?',
    error_jira_fetch: 'Lấy JIRA thất bại: ',
    error_ticket_locked: 'Người dùng khác đang chỉnh sửa.\nVui lòng thử lại sau.',
    error_move_version: 'Di chuyển phiên bản thất bại: ',
    hint_file_size_limit: 'Dung lượng Google Drive giới hạn 15 GB. Với tệp lớn hơn 1 GB (firmware, v.v.), vui lòng dùng mục liên kết bên dưới thay vì tải lên trực tiếp.',
    placeholder_link_label: 'Mô tả tệp',
    label_links: 'Liên kết',
    btn_select_mode: 'Di chuyển vé',
    btn_select_mode_active: 'Hủy di chuyển',
    bulk_move_btn: 'Di chuyển vé đã chọn',
    bulk_target_placeholder: 'Chọn phiên bản đích',
    unit_selected: ' đã chọn',
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

// 언어 변경 콜백 — 각 페이지(index.js, detail.js)가 onLangChange()로 등록
let _onLangChange = null;
function onLangChange(cb) { _onLangChange = cb; }

// 드롭다운 버튼 텍스트와 active 클래스 갱신 (init 시 + setLang 시 공통 사용)
function _refreshLangDropdown(lang) {
  const btn  = document.getElementById('lang-dropdown-btn');
  const menu = document.getElementById('lang-dropdown-menu');
  if (!btn || !menu) return;
  const m = LANG_META[lang] || LANG_META.ko;
  btn.innerHTML = `<span class="fi ${m.flag}"></span><span>${m.label}</span><span class="lang-arrow">▼</span>`;
  menu.querySelectorAll('[data-lang]').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.lang === lang);
  });
}

// 언어 변경: localStorage 저장 → 드롭다운 갱신 → 페이지 콜백 호출 (reload 없음)
function setLang(lang) {
  localStorage.setItem('dqa_lang', lang);
  _refreshLangDropdown(lang);
  if (_onLangChange) _onLangChange(lang);
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

  _refreshLangDropdown(getLang());

  btn.addEventListener('click', e => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });

  menu.querySelectorAll('[data-lang]').forEach(opt => {
    opt.addEventListener('click', () => {
      menu.classList.remove('open');
      setLang(opt.dataset.lang);
    });
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

// ─── 실시순서 cascade 공용 유틸 ────────────────────────────────────────────────

// 연속된 번호만 +1씩 밀기. tickets 배열 내 객체를 직접 수정하고 변경된 티켓 반환.
// fromPriority부터 연속된 번호(빈칸 없이 이어지는 번호)만 밀기; 빈칸에서 중지.
function cascadeShift(tickets, fromPriority, excludeRowId) {
  const occupiedSet = new Set(
    tickets
      .filter(tk => tk.row_id !== excludeRowId && Number(tk.priority) > 0)
      .map(tk => Number(tk.priority))
  );
  const toShift = [];
  let cur = Number(fromPriority);
  while (occupiedSet.has(cur)) { toShift.push(cur); cur++; }

  const changed = [];
  toShift.reverse().forEach(p => {
    const tk = tickets.find(t => t.row_id !== excludeRowId && Number(t.priority) === p);
    if (tk) { tk.priority = String(p + 1); changed.push(tk); }
  });
  return changed;
}

// 메모리 변경 없이 cascade 적용 결과를 [{row_id, priority}, ...] 형태로 반환.
function computeCascadeUpdates(tickets, fromPriority, excludeRowId) {
  const priorityMap = new Map(
    tickets
      .filter(tk => tk.row_id !== excludeRowId && Number(tk.priority) > 0)
      .map(tk => [Number(tk.priority), tk])
  );
  const toShift = [];
  let cur = Number(fromPriority);
  while (priorityMap.has(cur)) { toShift.push(cur); cur++; }

  return toShift.reverse().map(p => {
    const tk = priorityMap.get(p);
    return tk ? { row_id: tk.row_id, priority: String(p + 1) } : null;
  }).filter(Boolean);
}
