---
name: tower-upgrade
description: workspace 혁신을 Tower 템플릿에 반영 — 신규 설치 서버에 구조화된 경험 전파
user_invocable: true
triggers:
  - /tower-upgrade
  - tower upgrade
  - 타워 업그레이드
  - 템플릿 업데이트
  - setup 반영
---

# /tower-upgrade — Workspace → Tower Template Bridge

우리 workspace에서 만든 새로운 기능, 구조, 패턴을 Tower의 설치 템플릿(`~/tower/templates/workspace/`)과 `setup.sh`에 안전하게 반영한다.

**핵심 원칙: 기존 설치는 절대 깨뜨리지 않는다.**

## When to Use

- "이 기능 Tower에 적용하자" — workspace의 특정 기능을 템플릿에 추가
- "최근 workspace 변경사항 중에 템플릿에 반영할 게 있나?" — diff 기반 브레인스토밍
- "새 서버에도 이 구조가 있으면 좋겠다" — 구조 전파
- "/tower-upgrade scan" — 자동 스캔 모드

## Execution Flow

### Phase 1: Discovery (무엇이 변했는가?)

1. **workspace 현재 구조 스캔**:
   ```bash
   # workspace의 실제 디렉토리 구조
   find ~/workspace -maxdepth 3 -type f -name "*.js" -o -name "*.json" -o -name "*.md" -o -name "*.sh" | head -50

   # workspace의 .claude/ 설정
   ls -la ~/workspace/.claude/

   # Published apps/sites
   curl -s http://127.0.0.1:32400/hub/api/health 2>/dev/null
   ```

2. **template과 비교**:
   ```bash
   # 현재 템플릿 구조
   find ~/tower/templates/workspace -type f

   # workspace에는 있지만 template에는 없는 것
   diff <(cd ~/workspace && find . -maxdepth 3 -type d | sort) \
        <(cd ~/tower/templates/workspace && find . -maxdepth 3 -type d | sort)
   ```

3. **최근 git 변경 분석** (선택적):
   ```bash
   cd ~/workspace && git log --oneline --since="2 weeks ago" -- published/ .claude/ CLAUDE.md
   ```

### Phase 2: Analysis (무엇을 반영할 수 있는가?)

발견한 차이를 분류한다:

| 카테고리 | 설명 | 예시 |
|----------|------|------|
| **Structure** | 디렉토리/파일 구조 | 새 폴더, 설정 파일 |
| **Config** | 설정, hooks, settings | .claude/settings.json 변경 |
| **Service** | 시스템 서비스, 앱 | 새 published app, systemd 서비스 |
| **Knowledge** | CLAUDE.md, skills, docs | 에이전트 행동 규칙, 스킬 |
| **Infra** | nginx, systemd, cron | 인프라 자동화 |

각 항목에 대해:
- **이것이 "우리만의 것"인가?** (특정 프로젝트 데이터, API 키 등 → 제외)
- **이것이 "구조적 패턴"인가?** (다른 팀도 쓸 수 있는 것 → 후보)
- **기존 설치에 영향을 주는가?** (파일 덮어쓰기, 포트 충돌 등 → 주의)

### Phase 3: Proposal (제안서 작성)

사용자에게 반영 후보를 테이블로 보여준다:

```
╔═══╦══════════════════════════╦══════════╦════════════╗
║ # ║ 항목                     ║ 카테고리  ║ 안전도      ║
╠═══╬══════════════════════════╬══════════╬════════════╣
║ 1 ║ .claude/settings.json    ║ Config   ║ ✅ additive ║
║ 2 ║ published/apps/new-dash  ║ Service  ║ ⚠️ optional ║
║ 3 ║ CLAUDE.md 새 섹션         ║ Knowledge║ ✅ additive ║
╚═══╩══════════════════════════╩══════════╩════════════╝
```

**안전도 등급**:
- ✅ **additive** — 새 파일 추가만, 기존 것 안 건드림
- ⚠️ **optional** — 선택적 설치, 사용자가 opt-in
- 🔶 **merge** — 기존 파일에 내용 추가 (충돌 가능, 신중하게)
- 🚫 **breaking** — 기존 것을 바꿈 (사용자 명시 승인 필요)

### Phase 4: Apply (선택적 적용)

사용자가 승인한 항목만 반영한다.

**반영 대상 파일**:

1. **`~/tower/templates/workspace/`** — 신규 설치 시 복사될 템플릿
2. **`~/tower/setup.sh`** — 설치 스크립트 (새 단계 추가 시)
3. **`~/tower/skills/`** — 번들 스킬 (install-skills.sh가 설치)

**반영 원칙**:

```
DO:
  - 새 파일/디렉토리 추가 (additive)
  - setup.sh에 새 optional step 추가
  - 템플릿에 새 기본 파일 추가
  - 기존 파일이 없을 때만 복사하는 로직 (if [ ! -f ... ])

DON'T:
  - 기존 템플릿 파일 덮어쓰기
  - setup.sh의 기존 step 로직 변경
  - 하드코딩된 경로/도메인/API 키 포함
  - 특정 팀의 프로젝트 데이터 포함
```

### Phase 5: Verify (검증)

반영 후 확인:

```bash
# setup.sh 문법 검증
bash -n ~/tower/setup.sh

# 템플릿 구조 확인
find ~/tower/templates/workspace -type f | sort

# 기존 workspace와 충돌 없는지 시뮬레이션
# (실제 복사하지 않고 어떤 파일이 영향받는지만 출력)
for f in $(find ~/tower/templates/workspace -type f); do
  rel="${f#*/templates/workspace/}"
  target="$HOME/workspace/$rel"
  if [ -f "$target" ]; then
    echo "EXISTS (skip): $rel"
  else
    echo "NEW: $rel"
  fi
done
```

## Safety Mechanisms

### Version Tracking

`~/tower/templates/workspace/.template-version` 파일로 템플릿 버전을 추적:

```json
{
  "version": "2026-03-10",
  "features": [
    "workspace-base",
    "publishing-hub-v2",
    "pretooluse-hooks"
  ],
  "changelog": [
    {"date": "2026-03-10", "added": "publishing-hub-v2", "by": "tower-upgrade"}
  ]
}
```

### Dry-Run Mode

`/tower-upgrade scan` — 실제 변경 없이 발견사항만 보고.
`/tower-upgrade apply` — 승인된 항목 실제 반영.

### Rollback

모든 변경은 git에 커밋되므로 `git diff` / `git revert`로 롤백 가능.
setup.sh의 새 단계는 항상 `read -p "Install X? (y/N)"` 형태로 opt-in.

## Examples

### "Publishing Hub 패턴을 다른 앱에도 적용하자"

```
User: 우리 workspace에 있는 edge-dashboard 같은 걸 template에 넣을 수 있을까?

tower-upgrade →
  Phase 1: edge-dashboard는 quant_modeling 프로젝트의 일부 (특정 프로젝트 종속)
  Phase 2: "서비스 자체"는 ❌ 하지만 "패턴"은 ✅
           → manifest.json에 app 등록 → Hub가 자동 배포하는 흐름은 이미 일반화됨
  Phase 3: 제안 없음 (이미 Hub v2에 내장된 기능)
  결론: "새 앱을 만들면 Hub API로 등록하면 됩니다. 추가 템플릿 변경 불필요."
```

### "CLAUDE.md에 추가한 새 규칙을 template에도 넣자"

```
User: /tower-upgrade CLAUDE.md에 추가한 커뮤니케이션 스타일 규칙을 반영하자

tower-upgrade →
  Phase 1: workspace CLAUDE.md vs template CLAUDE.md diff
  Phase 2: "커뮤니케이션 스타일" 섹션이 template에 없음 → Structure/Knowledge 후보
  Phase 3: ✅ additive — template의 CLAUDE.md 위자드에 새 옵션으로 추가
  Phase 4: setup.sh의 CLAUDE.md 생성 부분에 섹션 추가
```

## Notes

- 이 스킬은 `~/tower` repo에서 실행해야 한다 (템플릿 수정 권한 필요)
- workspace가 있어야 비교 가능 — 없으면 scan만 제한적으로 동작
- 대규모 변경은 별도 브랜치에서 작업하고 PR로 리뷰할 것을 권장
