---
name: create-kanban-task
description: >
  Create, list, update, and manage tasks on the Agent Board (kanban).
  Use when the user says "/create-kanban-task", "태스크 만들어", "할일 추가", "create task",
  "add to board", "show tasks", "태스크 목록", or wants to manage kanban tasks.
argument-hint: "<title> | list [status] | update <id> <field=value> | delete <id> | subtask <parentId> <title>"
version: 1.0.0
---

# /create-kanban-task — Agent Board 태스크 관리

Tower Agent Board(칸반 보드)의 태스크를 생성·조회·수정·삭제한다.
UI에서 수동으로 만드는 대신, 대화 중에 바로 태스크를 추가할 수 있다.

## 사용법

```
/create-kanban-task <title>                      — 새 태스크 생성 (자연어 제목)
/create-kanban-task <title> --cwd <path>         — 작업 디렉토리 지정하여 생성
/create-kanban-task list                         — 모든 태스크 목록
/create-kanban-task list todo|in_progress|done   — 상태별 필터링
/create-kanban-task update <id> status=done      — 태스크 상태 변경
/create-kanban-task delete <id>                  — 태스크 삭제 (아카이브)
/create-kanban-task subtask <parentId> <title>   — 하위 태스크 생성
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
인자가 없거나 자연어만 있으면 **자동 모드**로 태스크를 생성한다.

---

### 모드 1: 태스크 생성 (기본 모드)

인자가 `list`, `update`, `delete`, `subtask`가 아니면 모두 생성 모드로 동작한다.

1. 인자에서 title을 추출한다. 자연어면 적절한 제목을 만든다.
2. 옵션을 파싱한다:
   - `--cwd <path>`: 작업 디렉토리 (기본: 현재 프로젝트의 cwd 또는 `~/claude-desk`)
   - `--model <model>`: 모델 선택 (기본: `claude-sonnet-4-20250514`)
   - `--workflow <mode>`: auto, simple, default, feature, big_task (기본: `auto`)
   - `--description <text>`: 설명 (없으면 대화 맥락에서 생성)
   - `--scheduled <ISO datetime>`: 예약 실행 시간
   - `--cron <expression>`: 반복 실행 크론 표현식
3. 누락된 필수 값(cwd)은 합리적으로 추론한다:
   - 현재 대화의 프로젝트 폴더가 있으면 그것을 사용
   - 없으면 `~/claude-desk` 사용
4. API 호출:

```bash
curl -s -X POST "$BASE/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "<제목>",
    "description": "<설명>",
    "cwd": "<작업 디렉토리>",
    "model": "<모델>",
    "workflow": "<워크플로우>"
  }'
```

5. 응답에서 생성된 태스크 정보를 사용자에게 보여준다:
   - ID, 제목, 상태, 작업 디렉토리
   - Agent Board에서 확인할 수 있다는 안내

**여러 태스크 한번에 생성**: 사용자가 여러 작업을 나열하면 각각 별도 API 호출로 생성한다.

---

### 모드 2: 태스크 목록 (`/create-kanban-task list [status]`)

1. 상태 필터가 있으면 기억해둔다 (todo, in_progress, done, failed).
2. API 호출:

```bash
curl -s "$BASE/tasks" \
  -H "Authorization: Bearer $TOKEN" | node -e "
const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
const filter = process.argv[1];
const tasks = filter ? data.filter(t => t.status === filter) : data;
const cols = { todo: '📋 Todo', in_progress: '🔄 진행중', done: '✅ 완료', failed: '❌ 실패' };
for (const [status, label] of Object.entries(cols)) {
  const items = tasks.filter(t => t.status === status);
  if (items.length === 0) continue;
  console.log('\n' + label + ' (' + items.length + ')');
  items.forEach(t => console.log('  [' + t.id.slice(0,8) + '] ' + t.title + (t.model ? ' (' + t.model + ')' : '')));
}
if (tasks.length === 0) console.log('태스크가 없습니다.');
" "$STATUS_FILTER"
```

3. 결과를 칸반 형태로 정리해서 보여준다.

---

### 모드 3: 태스크 수정 (`/create-kanban-task update <id> <field=value>`)

1. ID와 변경할 필드를 파싱한다.
   - 지원 필드: `status`, `title`, `description`, `model`, `workflow`, `cwd`
   - status 값: `todo`, `in_progress`, `done`, `failed`
2. ID는 앞 8자만으로도 매칭한다 (먼저 목록을 조회해서 전체 ID를 찾는다).
3. API 호출:

```bash
curl -s -X PATCH "$BASE/tasks/<full-id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"<field>": "<value>"}'
```

4. 변경 결과를 보여준다.

---

### 모드 4: 태스크 삭제 (`/create-kanban-task delete <id>`)

1. ID를 파싱한다 (앞 8자 매칭 지원).
2. **삭제 전 사용자에게 확인을 요청한다.**
3. API 호출:

```bash
curl -s -X DELETE "$BASE/tasks/<full-id>" \
  -H "Authorization: Bearer $TOKEN"
```

4. 삭제 완료를 알린다.

---

### 모드 5: 하위 태스크 (`/create-kanban-task subtask <parentId> <title>`)

1. 부모 태스크 ID와 하위 태스크 제목을 파싱한다.
2. 부모 태스크를 조회해서 cwd와 model을 상속한다.
3. API 호출:

```bash
curl -s -X POST "$BASE/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "<제목>",
    "description": "",
    "cwd": "<부모의 cwd>",
    "model": "<부모의 model>",
    "parentTaskId": "<부모 ID>"
  }'
```

4. 생성된 하위 태스크 정보를 보여준다.

---

## 자연어 모드

인자가 `list`, `update`, `delete`, `subtask` 키워드 없이 자연어로 주어지면:

- **생성 의도** (기본) → 모드 1 실행
  - 예: `/create-kanban-task ETF 리서치 자동화 스크립트 만들기`
  - 예: `/create-kanban-task claude-desk 프론트엔드 테스트 추가`
- **조회 의도** 감지 시 → 모드 2 실행
  - 예: `/create-kanban-task 지금 뭐 하고 있어?`
  - 예: `/create-kanban-task 진행중인 작업 보여줘`
- **수정 의도** 감지 시 → 모드 3 실행
  - 예: `/create-kanban-task abc12345 완료 처리해줘`

## 모델 옵션

| 값 | 설명 |
|---|---|
| `claude-opus-4-0-20250514` | Opus 4 — 복잡한 작업 |
| `claude-sonnet-4-20250514` | Sonnet 4 — 기본, 균형 |
| `claude-haiku-4-20250414` | Haiku 4 — 빠른 작업 |

## 워크플로우 옵션

| 값 | 설명 |
|---|---|
| `auto` | 자동 분류 (기본) |
| `simple` | 코드 변경 없음 (리서치, 분석) |
| `default` | 가벼운 수정 (버그픽스, 설정) |
| `feature` | 새 기능 (전용 브랜치 생성) |
| `big_task` | 대규모 작업 (하위 태스크로 분해) |

## Key Principles

- **태스크 제목은 구체적으로** — "프론트엔드 수정"보다 "Header 컴포넌트에 다크모드 토글 추가"
- **cwd는 정확하게** — 잘못된 작업 디렉토리는 에이전트 실행 실패의 주요 원인
- **삭제 전 항상 확인** — 실행 중인 태스크는 삭제하지 않는다
- **자연어 우선** — 키워드를 몰라도 자연어로 의도를 전달하면 된다
