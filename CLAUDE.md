# DQA Ticket Manager 프로젝트 규칙

## 현재 버전

**v0.1.0** (2026-06-27)

## 버전 관리 규칙 (SemVer)

`MAJOR.MINOR.PATCH` 형식으로 관리한다.

| 변경 규모 | 올릴 숫자 | 예시 |
|-----------|-----------|------|
| 버그 수정 | PATCH (세 번째) | 1.0.0 → 1.0.1 |
| 기능 추가 | MINOR (두 번째) | 1.0.0 → 1.1.0 |
| 대규모 변경 | MAJOR (첫 번째) | 1.0.0 → 2.0.0 |

버전 업 시 반드시 아래를 함께 갱신한다:
1. **CLAUDE.md** 상단 "현재 버전" 숫자
2. **수정히스토리.md**에 `## vX.Y.Z` 릴리즈 기록 추가

---

## 프로젝트 정보

- **GAS URL**: https://script.google.com/macros/s/AKfycbzzUsXwJ4oOrX63HmSyScYRtzCnpUD5shGTRwwxfwg1KX_UfVdpoflcex6vvdvnlrZc0A/exec
- **GitHub Pages URL**: https://wwpay.github.io/dqa-ticket
- **Google Sheets**: tickets 시트 + versions 시트
- **GAS 수정 시**: Code.gs 복붙 → 저장 → 배포 관리 → 새 버전으로 재배포 (액세스: 모든 사용자)

---

## GAS 규칙

- `.gs` 파일 수정 후에는 반드시 **재배포** 필요: 배포 → 배포 관리 → 새 버전
- 모든 datetime은 **JST (UTC+9)**: `new Date(new Date().getTime() + 9*60*60*1000)`
- 인증 정보는 **PropertiesService.getScriptProperties()** 에 저장
- doPost 라우팅 필드명은 **`type`** (action 아님)
- 모든 응답: `ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON)`
- 모든 쓰기 작업은 `LockService.getScriptLock()` 으로 감싸기

---

## Script Properties (GAS 편집기에서 설정)

| 키 | 설명 |
|----|------|
| `JIRA_BASE_URL` | 예) `https://wjira.humaxdigital.com` |
| `JIRA_EMAIL` | JIRA 로그인 ID 또는 이메일 |
| `JIRA_PASSWORD` | JIRA 로그인 비밀번호 (Server/DC — Basic Auth) |
| `DRIVE_FOLDER_ID` | 파일 업로드용 Google Drive 폴더 ID |
| `SPREADSHEET_ID` | Google Sheets 스프레드시트 ID |

---

## Sheets 스키마 — tickets 시트

| 열 | 필드 | 비고 |
|----|------|------|
| A | ticket_id | 예) XAX2-2667 |
| B | created_date | ISO 날짜, 등록 시 JST 자동 입력 |
| C | title | JIRA 이슈 제목, 수동 입력 |
| D | check_version | 확인버전 (쉼표 구분, 최대 4개) |
| E | assignee | 박수원 / 홍경두 / MVN |
| F | priority | 1/2/3, 활성 티켓만, 비활성은 빈칸 |
| G | status | 진행중 / 진행전 / 완료 / 보류 / N/A |
| H | verdict | OK / NG / 빈칸 |
| I | check_content | 확인내용 |
| J | note | 비고 |
| K | wjira_updated | "OK" 또는 빈칸 |
| L | status_changed_at | ISO datetime JST, 상태 변경 시 자동 입력 |
| M | file_urls | 쉼표 구분, 각 항목 `이름|크기|URL` 형식 |
| N | row_id | UUID, 등록 시 자동 생성 |
| O | retest_ref | 복제/재테스트 티켓의 원본 ticket_id |
| P | version_id | 소속 버전 탭 UUID (versions 시트 참조) |

---

## Sheets 스키마 — versions 시트

| 열 | 필드 | 비고 |
|----|------|------|
| A | version_id | UUID, 자동 생성 |
| B | version_name | 예) V09.02.20 |
| C | status | 진행중 / 완료 |
| D | created_at | ISO datetime JST, 자동 입력 |
| E | sort_order | 표시 순서 (숫자) |

---

## 버전 탭 동작 규칙

- 실시순서(priority)는 **버전별로 독립 관리**: `renumberActiveGroup(sheet, assignee, versionId)` 가 버전 내 WW/MVN 그룹 재번호 매김
- `doGet?version_id=…` 는 해당 버전 티켓만 반환 (파라미터 없으면 전체 — 하위 호환)
- 프론트엔드: "전체" 가상 탭 + 버전별 탭. 선택 상태는 `localStorage['dqa_current_version']` 에 저장

---

## 초기 설정 순서

1. `Code.gs` 를 GAS 편집기에 붙여넣기
2. `setupInitialHeaders()` 1회 수동 실행 → tickets 시트 + versions 시트 자동 생성
3. 기존 시트가 있으면 `setupVersionHeaders()` 1회 실행 → versions 시트 생성 + tickets 시트에 retest_ref(O) / version_id(P) 헤더 추가
4. Script Properties 모두 설정
5. 웹앱으로 배포: 실행 계정=나 / 액세스=모든 사용자
6. 웹앱 URL을 프론트엔드 `js/api.js` 의 `GAS_URL` 에 설정

---

## 파일 수정 시 필수 규칙

**어떤 파일을 수정하든** 아래 3가지를 반드시 실행한다.

### 1. 수정한 파일 상단에 로그 기재

파일 상단(주석 처리 가능한 위치)에 아래 형식으로 기재한다:

```
수정: YYYY-MM-DD HH:MM — [수정 내용 간단히]
```

### 2. index.html 상단 주석 업데이트

수정 여부와 관계없이 **반드시** `<head>` 안 최상단 주석 블록을 최신 1줄로 교체한다. 이전 내용은 삭제하고 **최신 1줄만** 유지한다:

```html
<!--
  수정: 2026-06-27 10:00 — 버전 탭 폴더 스타일 적용
-->
```

### 3. 수정히스토리.md에 항목 추가

파일 상단 헤더 **바로 아래에 삽입**한다 — 최신 항목이 항상 위에 오도록.

```
## YYYY-MM-DD HH:MM JST
- [수정 내용 간단히]
```

### 기타 주의사항

- 날짜/시간은 반드시 **JST(일본 표준시, Asia/Tokyo)** 기준으로 기록한다
- 코드에서 날짜/시간을 다룰 때는 `Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss")` 사용
- 내용은 한국어로 작성
- 수정이 끝나면 반드시 **커밋 & 푸시**한다

---

## 숙제(작업 인수인계) 기록 규칙

집 ↔ 회사 등 기기를 오가며 작업을 끊김 없이 이어가기 위한 인수인계 파일이 `숙제.md`이다.

- 사용자가 **"숙제 기록"**(또는 "숙제에 기록", "숙제 정리해" 등 유사 표현)이라고 하면, 지금까지의 작업 상태를 `숙제.md`에 **덮어써서** 정리한다.
- 다른 기기에서 새 Claude 세션이 **이 파일만 읽어도 작업을 이어갈 수 있을 만큼 누락 없이** 작성한다. 포함할 것:
  1. 지금 무슨 작업 중인지(목적)
  2. 확정된 결정·모델·규칙 (되돌리면 안 되는 합의 사항)
  3. 오늘(이번 세션) 변경한 것 — 무엇을·왜·어떻게 (변경 파일·커밋 해시)
  4. 남은 할 일(TODO) — 우선순위와 함께
  5. 주의/보류 사항
- 완료된 TODO는 `숙제.md`에서 삭제한다 (완료 표시만 남기지 말고 항목 자체를 지운다).
- 상단에 "최종 갱신: YYYY-MM-DD HH:MM JST"를 적는다.
- 작성 후 **반드시 커밋 & 푸시**한다.
- 새 세션 시작 시 `숙제.md`가 있으면 먼저 읽고 맥락을 파악한 뒤 작업한다.

---

## "마무리" 한 방 규칙 (작업 종료 트리거)

사용자가 **"마무리하자"**, **"오늘은 여기까지"**, **"내일 하자"**, **"끝내자"** 등 **작업 종료를 알리는 표현**을 하면, 추가 확인 없이 **아래를 원스텝으로 한 번에** 실행한다:

1. 진행 중이던 변경/논의 내용을 `숙제.md`에 **덮어써서** 정리한다.
2. 수정한 파일이 있으면 위 "파일 수정 시 필수 규칙" 3가지를 적용한다.
3. 변경된 **모든 파일을 저장**하고 `git add -A` → **커밋 & 푸시**한다.

---

## 수정 완료 후 출력 형식

수정이 완료되면 반드시 아래 형식으로 결과를 출력한다:

```
### 요구사항
[사용자가 요청한 내용을 그대로 또는 요약하여 기재]

### 수정 내용
[변경된 파일과 변경 내용을 구체적으로 기재]
```

---

## 수정 이력 (최신이 위)

| 날짜 | 변경 내용 |
|------|-----------|
| 2026-06-28 | versions.html/js/css: 드래그앤드롭 순서 변경(원래대로/순서저장), 헤더 ↕ 정렬(정렬중 드래그 비활성), 컬럼 정렬, 드롭 인디케이터, 하이라이트, 안내 문구 |
| 2026-06-28 | versions.html/js: 테이블 헤더 정렬 기능(버전명/티켓수/생성일 ▲▼ 토글); 로딩 오버레이 텍스트 추가 |
| 2026-06-28 | index.html: 사이드바 버튼 텍스트 "새 버전 추가" → "버전 관리" |
| 2026-06-27 | detail.html/js/css: 3단 그리드 레이아웃 (확인버전/진행정보/버전이동) |
| 2026-06-27 | detail.js: 버전이동 레이블 현재 버전명 표시, 신규 등록 시 최신 버전 자동 선택 |
| 2026-06-27 | 사이드탭 폴더 스타일 디자인 적용 |
| 2026-06-27 | 버전 관리 페이지 추가: versions.html + js/versions.js |
| 2026-06-27 | GAS: updateVersion / deleteVersion 추가 |
| 2026-06-27 | 버전 탭 기능: versions 시트, version_id 컬럼(P), getVersions/addVersion/moveTicket |
| 2026-06-26 | 프론트엔드 초기 구축: index.html, detail.html, css, js 전체 |
| 2026-06-26 | Code.gs 초기 구축: doGet, addTicket, updateTicket, fetchJira, uploadFile |
