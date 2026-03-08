# Tower

**Your team's AI that builds its own tools.**

🌐 [English](README.md) · [한국어](README.ko.md)

<p align="center">
  <img src="capture-chat.png" alt="Tower — chat with Claude Code in the browser" width="720" />
</p>

Tower turns Claude Code into a **team-wide AI command center**. Chat in the browser. Automate from the board. Every session is recorded, every decision is logged, every file change is tracked. What one person teaches Claude, everyone benefits from.

---

## Automate Everything

Create a task. Claude executes it. **Tasks create tasks.** "Plan our product launch" spawns market research, competitor analysis, pricing, and timeline — each running autonomously. Your weekly reports write themselves. Proposals draft themselves from templates. Onboarding runs itself.

<p align="center">
  <img src="capture-board.png" alt="Tower — Agent Board with autonomous task execution" width="720" />
</p>

The board is your control room. The agents are your workforce.

---

## Why Tower

| | Solo AI | **Tower** |
|---|---|---|
| **Who** | One person, one terminal | **Entire team, one browser** |
| **Output** | Conversations that vanish | **Artifacts — code, docs, decisions** |
| **Memory** | Dies with the session | **Persists across people and time** |
| **Growth** | Static | **Builds its own tools** |

---

## What's Inside

**🛠 20+ Skills** — Brainstorming, debugging, code review, planning, UI/UX design. Today's one-off task becomes tomorrow's one-click skill. Your team starts at 80%.

**🧠 Team Brain** — Three layers of memory. What one person learns, Claude knows for everyone. New hire joins? Claude already knows the project.

**📂 Project Workspaces** — Each project gets its own folder, its own `CLAUDE.md` instructions, its own history. Marketing copy never leaks into API code.

```
workspace/
├── projects/
│   ├── marketing-site/
│   │   └── CLAUDE.md    ← "Brand voice is casual. Use Next.js."
│   ├── api-backend/
│   │   └── CLAUDE.md    ← "Use Go. Follow company style guide."
│   └── onboarding-docs/
│       └── CLAUDE.md    ← "Write for non-technical readers."
└── memory/MEMORY.md      ← Shared context across all projects
```

**🚀 Publishing Hub** — Turn any AI-generated artifact into a live site or app. One click. Your server. No vendor lock-in.

<p align="center">
  <img src="capture-publish.png" alt="Tower — Publishing Hub" width="720" />
</p>

**🔧 Git + Docs + Mobile** — Auto-commit on every edit. Built-in document viewer (HTML, Markdown, PDF). Voice input from your phone — full server compute from anywhere.

---

## Get Started

```bash
git clone https://github.com/juliuschun/tower.git
cd tower
bash setup.sh    # installs everything, asks you a few questions
npm run dev      # → http://localhost:32354
```

See **[INSTALL.md](INSTALL.md)** for details.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 · TypeScript · Vite 6 · Zustand · Tailwind CSS 4 |
| **Backend** | Express · TypeScript · WebSocket · SQLite (WAL + FTS5) |
| **AI Engine** | Claude Agent SDK · MCP protocol · 20+ skills |
| **Auth** | JWT · bcrypt · Role-based (admin / owner / member / guest) |

---

> Fair warning: this has bugs. But it works, and we use it every day.

## License

[Apache License 2.0](LICENSE)
