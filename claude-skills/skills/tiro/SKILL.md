---
name: tiro
description: "Tiro 회의 녹음 API 연동. 노트 목록 조회, 전사본/AI 요약 다운로드, 마크다운 저장. Actions: fetch, list, download meeting notes, transcripts, summaries. Triggers: tiro, 티로, 회의록 가져오기, 녹음 다운로드, meeting notes, /tiro."
argument-hint: "[list|all|폴더경로]"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
---

# Tiro - 회의 녹음 API 연동 스킬

Tiro 앱의 회의 녹음 데이터를 API로 가져와 마크다운/텍스트 파일로 저장합니다.

## API 정보

- Base URL: `https://api.tiro.ooo`
- 인증: `Authorization: Bearer {tiro_key}`
- 키 형식: `{id}.{secret}` (platform.tiro.ooo에서 발급)

## 인자 처리

| 인자 | 동작 |
|------|------|
| (없음) | 전체 워크플로우: 목록 → 선택 → 폴더 지정 → 저장 |
| `list` | 노트 목록만 조회하고 표시 |
| `all` | 모든 노트 일괄 다운로드 |
| 폴더경로 | 해당 폴더에 바로 저장 (목록→선택 후) |

`$ARGUMENTS` 값을 확인하여 분기합니다.

---

## 실행 흐름

### Step 1: API 키 찾기

아래 순서로 `tiro_key`를 탐색합니다:

```bash
# 1) 현재 프로젝트 .env
grep -s 'tiro_key=' .env | head -1 | cut -d= -f2-

# 2) 홈 디렉토리 .env
grep -s 'tiro_key=' ~/.env | head -1 | cut -d= -f2-
```

- 키를 찾으면 변수로 사용
- 못 찾으면 AskUserQuestion으로 "Tiro API 키를 입력해주세요" 요청
- 키가 `{id}.{secret}` 형식인지 간단 확인 (`.` 포함 여부)

### Step 2: 노트 목록 조회

```bash
curl -s -H "Authorization: Bearer $TIRO_KEY" \
  "https://api.tiro.ooo/v1/external/notes?limit=20&offset=0"
```

응답에서 각 노트의 정보를 추출하여 테이블로 표시:

```
## Tiro 노트 목록

| # | 제목 | 날짜 | 길이 | noteGuid |
|---|------|------|------|----------|
| 1 | 기업분석부 인터뷰 | 2026-03-03 | 45분 | BxJdoFKQaT8Wu |
| 2 | 투자전략부 미팅 | 2026-03-03 | 38분 | MSoGkrW3G7TnB |
...
```

**응답 필드 매핑:**
- `title` → 제목
- `createdAt` → 날짜 (ISO → YYYY-MM-DD 변환)
- `duration` → 길이 (초 → 분 변환)
- `noteGuid` → 식별자

**`list` 인자인 경우:** 여기서 종료.

### Step 3: 노트 선택

AskUserQuestion으로 어떤 노트를 가져올지 선택:

```
Question: "어떤 노트를 가져올까요?"
Header: "노트 선택"
multiSelect: true
Options:
  - "전체" (description: "모든 노트를 가져옵니다")
  - "{제목1}" (description: "{날짜}, {길이}분")
  - "{제목2}" (description: "{날짜}, {길이}분")
  - "{제목3}" (description: "{날짜}, {길이}분")
```

**`all` 인자인 경우:** 선택 없이 전체 노트 진행.

### Step 4: 저장 폴더 결정

`$ARGUMENTS`에 폴더 경로가 있으면 그대로 사용. 없으면 AskUserQuestion:

```
Question: "어디에 저장할까요?"
Header: "폴더"
Options:
  - "현재 디렉토리 (Recommended)" (description: "{pwd}")
  - "직접 입력" (description: "원하는 경로를 입력합니다")
```

- 폴더가 없으면 `mkdir -p`로 자동 생성
- 기존 파일이 있으면 덮어쓸지 확인

### Step 5: 데이터 수집

선택된 각 노트에 대해 **병렬로** 데이터를 수집합니다.

#### 5a. 전사본 (paragraphs)

```bash
curl -s -H "Authorization: Bearer $TIRO_KEY" \
  "https://api.tiro.ooo/v1/external/notes/{noteGuid}/paragraphs"
```

응답 구조: `{ paragraphs: [{ startAt, text, speaker, ... }] }`

각 paragraph에서 추출:
- `startAt` → 타임스탬프 (밀리초 → MM:SS 변환)
- `speaker` → 화자 (없으면 생략)
- `text` → 발화 내용

#### 5b. AI 요약 (summaries)

```bash
# 요약 목록
curl -s -H "Authorization: Bearer $TIRO_KEY" \
  "https://api.tiro.ooo/v1/external/notes/{noteGuid}/summaries"

# 각 요약 상세 (format 파라미터 없이!)
curl -s -H "Authorization: Bearer $TIRO_KEY" \
  "https://api.tiro.ooo/v1/external/notes/{noteGuid}/summaries/{summaryId}"
```

**중요:** 요약 상세 조회 시 `?format=markdown` 파라미터를 **붙이지 않습니다** (401 에러 발생). 기본 응답의 `content.content` 필드에 마크다운이 포함되어 있습니다.

요약 타입 우선순위: `ONE_PAGER` > `MINUTES` > 기타

### Step 6: 파일 생성

#### 요약 파일: `{YYYYMMDD}_{제목}.md`

```markdown
# {제목}

| 항목 | 내용 |
|------|------|
| 날짜 | {YYYY-MM-DD} |
| 길이 | {분}분 |
| 출처 | Tiro (noteGuid: {guid}) |

---

## AI 요약

{ONE_PAGER 또는 MINUTES 요약 내용}
```

#### 전사본 파일: `{YYYYMMDD}_{제목}_전사본.txt`

```
[00:00:15] 화자1: 발화 내용...
[00:01:22] 화자2: 발화 내용...
[00:03:45] 발화 내용... (화자 정보 없는 경우)
```

타임스탬프 변환: `startAt` (밀리초) → `[MM:SS]` 형식

### Step 7: 결과 보고

생성된 파일 목록을 표시:

```
## 완료

| 파일 | 크기 |
|------|------|
| 20260303_기업분석부.md | 2.1KB |
| 20260303_기업분석부_전사본.txt | 16.5KB |
| 20260303_투자전략부.md | 1.8KB |
| 20260303_투자전략부_전사본.txt | 22.8KB |

총 4개 파일이 {폴더경로}에 저장되었습니다.
```

---

## 에러 처리

| 에러 | 대응 |
|------|------|
| 401 Unauthorized | API 키 만료/잘못됨 → 사용자에게 키 재입력 요청 |
| 404 Not Found | 해당 노트 없음 → 건너뛰고 다음 노트 처리 |
| 네트워크 오류 | 1회 재시도 후 실패 시 사용자에게 보고 |
| 빈 paragraphs | "전사본이 아직 준비되지 않았습니다" 메시지 |
| 빈 summaries | "AI 요약이 아직 생성되지 않았습니다" 메시지 |

---

## 주의사항

- curl 결과는 jq로 파싱합니다 (jq 없으면 python3 -m json.tool 대체)
- 한글 제목의 파일명에서 특수문자(/, \, :, ?)는 제거합니다
- 대용량 전사본은 python3으로 JSON 파싱 후 텍스트 추출합니다
- 요약 상세 API에 `?format=markdown` 파라미터를 절대 붙이지 마세요 (401 에러)
