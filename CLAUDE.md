# DQA Ticket Manager — Claude 작업 규칙

QA 티켓 관리 웹앱. 빌드 없는 HTML/CSS/JS + 구글 스프레드시트(GAS) 연동. 화면 언어는 4개 국어(i18n).

## 이 파일들의 목적
Claude Code는 대화 내용을 자기 PC에만 저장한다. 그래서 CLAUDE.md(고정 정보)와 WORKLOG.md(작업 기록)를 git으로 공유해, 집↔회사 어느 PC에서든 같은 맥락으로 이어서 작업한다.
- 푸시와 풀은 사용자가 직접 한다 (빠뜨리면 사용자 책임). Claude는 푸시 여부를 걱정하지 않아도 된다
- Claude의 몫: 작업이 끝나면 (마무리라는 말이 없어도) WORKLOG.md를 최신으로 고쳐 둔다. 사용자가 푸시하기 전에 파일에 반영돼 있어야 다른 PC로 전달된다

## 시작할 때
1. 작업 브랜치는 `dev`. 먼저 `git pull origin dev` (집↔회사 동기화). 사용자에게는 "필요하면 터미널에 직접 입력하세요"라고 안내만 한다
2. 이 파일과 WORKLOG.md를 읽는다

## 구조
- 화면: `index.html`(목록), `detail.html`(티켓 상세), `versions.html`(버전 관리), `css/style.css`
- `js/` : api(서버 통신·GAS 주소 선택), index(목록), detail(상세), versions(버전 관리), i18n(번역)
- `Code.gs` : 구글 스프레드시트 쪽 서버 코드 (`.gs`라 `node --check` 불가 → `.js` 사본으로 검사)
- `bump-cache.ps1` : html의 `js/*.js?v=날짜` 숫자를 일괄 갱신
- `수정히스토리.md` : 전체 수정 이력 (길어서 필요할 때만)

## 주소·배포
- 운영: https://hmdqa20.github.io/dqa-ticket (GitHub Pages, master 브랜치)
- GAS 주소는 `js/api.js`가 접속 주소로 자동 선택: `hmdqa20.github.io`에서만 운영 GAS, 그 외(로컬 127.0.0.1, file://)는 전부 테스트(dev) GAS + 빨간 배너. 브랜치별로 api.js를 다르게 만들지 않는다
- 시트: tickets 시트(티켓) + versions 시트(버전 탭). 열 구성은 Code.gs 상단 헤더 참고
- `Code.gs`를 고쳤다면: 편집기에 전체 붙여넣기·저장 → 배포 관리 → **기존 배포 편집 → 새 버전**. "새 배포"는 주소가 바뀌므로 금지. push만으로는 GAS가 갱신되지 않는다
- 새 dev용 GAS가 필요하면: 테스트용 **사본 시트를 먼저 만들고**, 그 시트에서 확장 프로그램 → Apps Script로 생성. 이 dev GAS의 스크립트 속성에 `SPREADSHEET_ID`는 절대 넣지 않는다 (원본 시트 오염 방지)
- JS를 고치면 html의 `?v=` 숫자도 같이 올린다 (`bump-cache.ps1`)

## 지킬 규칙
- 커밋·푸시: 코드를 고칠 때마다 **커밋까지만** 자동. **푸시는 사용자가 "푸쉬해줘", "마무리 푸쉬", "올려줘"라고 분명히 말할 때만**. 푸시 대상은 `origin dev`와 `preview master`(테스트 환경)
- **`dev` → `master` 머지·푸시는 사용자의 명시적 승인 전까지 절대 금지**
- Code.gs가 포함된 푸시 뒤에는 꼭 안내: "GAS 편집기 → 배포 관리 → 기존 배포 편집 → 새 버전으로 재배포가 필요합니다"
- 파일 안에 수정이력 주석 금지. 변경 내용은 커밋 메시지에 구체적으로
- GAS 코드 규칙: 시간은 JST(`Utilities.formatDate(new Date(), "Asia/Tokyo", ...)`), 인증 정보는 Script Properties, doPost 분기 필드는 `type`, 응답은 JSON, 쓰기 작업은 `LockService.getScriptLock()`으로 감싼다
- 사용자에게는 한국어로 보고. 수정이 끝나면 `### 요구사항` / `### 수정 내용` 두 항목으로 정리
- "마무리하자", "오늘은 여기까지" 등 종료 표현이 나오면 확인 없이: ① WORKLOG.md 갱신(미완료 포함) ② 수정히스토리.md 상단에 이번 변경 추가 ③ `git add -A` 후 **커밋** (푸시는 별도 요청이 있을 때만)

## 되돌리면 안 되는 합의
- 내부 이름 `activeWW`, CSS `--ww` 등은 그대로 둔다 (화면 표시는 이미 DQA. 이름 바꾸기는 위험 대비 이득이 없어 하지 않기로 함)
- 실시순서: 담당 그룹(DQA/MVN) × 버전이 각각 독립. 그룹·버전을 옮기면 번호는 초기화. 번호 충돌은 드롭다운 변경 시 확인 후 연속 번호만 밀어낸다
- 완료/보류로 옮긴 직후 목록 맨 앞에 넣는다 (`unshift`, 서버 정렬과 같게). `push`로 되돌리지 말 것
- 자동 갱신(`refreshList`)과 `fetchFreshList`에는 "현재 버전 탭과 같을 때만 화면 갱신" 확인이 둘 다 있어야 한다
- 상세 화면 저장 버튼 이름(등록/저장)은 `refreshSaveBtnLabel()` 한 곳에서만 정한다
- 편집 잠금 5분, heartbeat 2분. `js/index.js`의 `LOCK_EXPIRE_MS`와 Code.gs 값은 항상 같게
- **터치 드래그 3규칙** (하나라도 되돌리면 버그 재발, 수정 전 실기기 테스트): ① `draggable`을 마크업에 쓰지 말고 핸들 `mousedown` 때만 JS로 켜고 끝나면 끈다 ② 터치로 놓은 위치는 `elementFromPoint`가 아니라 좌표 계산(`resolveTouchDrop`)으로 판정 ③ `touchend` 맨 앞에 `e.preventDefault()` 유지
