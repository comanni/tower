---
name: search
description: >
  Search past conversations and sessions using FTS5 full-text search on tower.db.
  Use when the user says "/search", "과거 대화 찾아", "search sessions",
  "what did we discuss about X", or wants to find past context from Tower sessions.
argument-hint: "<keyword> | recent [N] | session <name> | stats"
version: 1.0.0
---

# /search — FTS5 기반 과거 대화 맥락 검색

Tower의 세션 + 메시지 DB(tower.db)를 FTS5 전문 검색으로 탐색한다.
`/memory`가 memory.db(훅 자동 캡처)를 검색하는 반면, `/search`는 실제 대화 내용을 검색한다.

## 사용법

```
/search <keyword>           — FTS5로 세션 이름 + 메시지 본문 검색, 맥락 종합
/search recent [N]          — 최근 N개 세션 요약 타임라인 (기본 10)
/search session <name>      — 특정 세션 찾아서 대화 내용 요약
/search stats               — DB 통계 (세션/메시지 수, 비용, 모델 사용)
```

## 공통: JWT 토큰 생성

모든 API 호출 전에 먼저 토큰을 생성한다:

```bash
cd ~/claude-desk && TOKEN=$(node -e "
const jwt = require('jsonwebtoken');
const fs = require('fs');
const env = fs.readFileSync('.env','utf-8');
let s='';
for(const l of env.split('\n')){if(l.startsWith('JWT_SECRET='))s=l.split('=').slice(1).join('=');}
console.log(jwt.sign({userId:1,username:'admin',role:'admin'},s,{expiresIn:'1h'}));
")
```

이후 모든 curl에 `-H "Authorization: Bearer $TOKEN"` 을 붙인다.
BASE URL: `http://localhost:32354/api`

## Execution

`$ARGUMENTS`를 파싱하여 아래 모드 중 하나를 실행한다.

---

### 모드 1: 키워드 검색 (`/search <keyword>`)

`$ARGUMENTS`가 `recent`, `session`, `stats`로 시작하지 않으면 전체를 키워드로 사용.

**Step 1: FTS5 검색**

```bash
QUERY="<keyword>"
RESULTS=$(curl -s "http://localhost:32354/api/search?q=$(echo "$QUERY" | jq -sRr @uri)&limit=30" \
  -H "Authorization: Bearer $TOKEN")
echo "$RESULTS" | jq .
```

**Step 2: 결과 분석 및 표시**

검색 결과 JSON 배열에서:
- `type: "session"` → 세션 이름/summary 매칭
- `type: "message"` → 메시지 본문 매칭

세션별로 그룹핑하여 표시:

```markdown
## 🔍 "<keyword>" 검색 결과

### 세션: <sessionName> (<date>)
- **세션 매칭**: <snippet from session match>
- **메시지 매칭** (N건):
  - `<role>`: <snippet> (<date>)
  - `<role>`: <snippet> (<date>)

### 세션: <sessionName> (<date>)
- **메시지 매칭** (N건):
  - ...

---
총 N개 세션에서 M건 발견
```

**Step 3: 맥락 심화 (선택적)**

가장 관련 높은 세션 1~2개에 대해 메시지를 추가 로드하여 전후 맥락을 제공:

```bash
SESSION_ID="<most relevant session id>"
MESSAGES=$(curl -s "http://localhost:32354/api/sessions/$SESSION_ID/messages" \
  -H "Authorization: Bearer $TOKEN")
echo "$MESSAGES" | jq '[.[] | select(.role == "user" or .role == "assistant") | {role, content: (.content | tostring | .[0:200]), created_at}] | .[-10:]'
```

이 메시지들을 읽고 대화 흐름을 요약한다.

---

### 모드 2: 최근 세션 (`/search recent [N]`)

N이 없으면 기본 10.

```bash
SESSIONS=$(curl -s "http://localhost:32354/api/sessions" \
  -H "Authorization: Bearer $TOKEN")
echo "$SESSIONS" | jq '.[:N]'
```

결과를 표시:

```markdown
## 📋 최근 세션 (N개)

| # | 세션 이름 | 날짜 | 요약 | 턴 | 비용 |
|---|----------|------|------|-----|------|
| 1 | <name> | <date> | <summary> | <turnCount> | $<cost> |
| 2 | ... | ... | ... | ... | ... |
```

- `name`: 세션 이름
- `created_at` → 날짜 (YYYY-MM-DD HH:mm)
- `summary`: 세션 요약 (없으면 "-")
- `turnCount`: 대화 턴 수
- `totalCost`: 비용 (없으면 "-")

---

### 모드 3: 세션 상세 (`/search session <name>`)

**Step 1: 세션 검색**

세션 이름으로 FTS 검색:

```bash
QUERY="<name>"
RESULTS=$(curl -s "http://localhost:32354/api/search?q=$(echo "$QUERY" | jq -sRr @uri)&limit=10" \
  -H "Authorization: Bearer $TOKEN")
echo "$RESULTS" | jq '[.[] | select(.type == "session")]'
```

매칭된 세션이 여러 개면 목록을 보여주고 유저에게 선택을 요청(AskUserQuestion).
하나면 바로 진행.

**Step 2: 메시지 로드**

```bash
SESSION_ID="<selected session id>"
MESSAGES=$(curl -s "http://localhost:32354/api/sessions/$SESSION_ID/messages" \
  -H "Authorization: Bearer $TOKEN")
echo "$MESSAGES" | jq '[.[] | select(.role == "user" or .role == "assistant") | {role, content: (.content | tostring | .[0:300]), created_at}]'
```

**Step 3: 대화 요약**

메시지를 읽고 다음을 종합:

```markdown
## 💬 세션: <sessionName>

**날짜**: <date>
**턴 수**: <turnCount> | **비용**: $<cost>
**요약**: <summary>

### 대화 흐름
1. 👤 유저가 <topic>에 대해 질문
2. 🤖 AI가 <response summary>
3. 👤 유저가 <follow-up>
4. ...

### 주요 결정/작업
- <key decision or action taken>
- <files modified or created>

### 결론
<what was the outcome, any pending items>
```

---

### 모드 4: 통계 (`/search stats`)

```bash
# 세션 목록에서 통계 추출
SESSIONS=$(curl -s "http://localhost:32354/api/sessions" \
  -H "Authorization: Bearer $TOKEN")

echo "$SESSIONS" | jq '{
  totalSessions: length,
  totalTurns: [.[].turnCount // 0] | add,
  totalCost: [.[].totalCost // 0] | add,
  avgTurnsPerSession: (([.[].turnCount // 0] | add) / length),
  oldestSession: (sort_by(.created_at) | first | .created_at),
  newestSession: (sort_by(.created_at) | last | .created_at),
  withSummary: [.[] | select(.summary != null and .summary != "")] | length,
  models: [.[].model // "unknown"] | group_by(.) | map({model: .[0], count: length}) | sort_by(-.count)
}'
```

결과를 표시:

```markdown
## 📊 Tower DB 통계

| 항목 | 값 |
|------|-----|
| 총 세션 수 | N |
| 총 대화 턴 수 | N |
| 평균 턴/세션 | N.N |
| 총 비용 | $N.NN |
| 요약 생성된 세션 | N/M |
| 가장 오래된 세션 | YYYY-MM-DD |
| 최근 세션 | YYYY-MM-DD |

### 모델 사용 분포
| 모델 | 사용 횟수 |
|------|----------|
| claude-opus-4-6 | N |
| claude-sonnet-4-6 | N |
```

---

## 인자 없음 (`/search`)

사용법 안내를 보여주고, 기본으로 `recent 5`를 실행한다.

```markdown
## /search — 과거 대화 맥락 검색

| 명령 | 설명 |
|------|------|
| `/search <keyword>` | FTS5 전문 검색 |
| `/search recent [N]` | 최근 N개 세션 (기본 10) |
| `/search session <name>` | 세션 상세 조회 |
| `/search stats` | DB 통계 |
```

그 다음 최근 5개 세션을 자동으로 보여준다.

## Rules

- **curl 에러 시** 서버가 꺼져 있을 수 있다. `http://localhost:32354/api/health`를 확인하고 안내.
- **검색 결과가 0건**이면 다른 키워드를 제안하거나, 최근 세션 목록을 대신 보여준다.
- **메시지 content는 JSON 문자열**일 수 있다. 표시 전에 텍스트만 추출한다.
- **비용은 소수점 4자리**까지 표시 ($0.0000).
- **날짜는 한국 시간 기준** YYYY-MM-DD HH:mm 형식으로 표시.
