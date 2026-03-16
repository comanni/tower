import React, { useState, useEffect, useCallback } from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import { useSessionStore } from '../../stores/session-store';

interface SettingsPanelProps {
  onLogout: () => void;
  onBrowserOpen?: () => void;
}

export function SettingsPanel({ onLogout, onBrowserOpen }: SettingsPanelProps) {
  const isOpen = useSettingsStore((s) => s.isOpen);
  const setOpen = useSettingsStore((s) => s.setOpen);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const isMobile = useSessionStore((s) => s.isMobile);
  const activeView = useSessionStore((s) => s.activeView);
  const setActiveView = useSessionStore((s) => s.setActiveView);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="relative bg-surface-900 border border-surface-700 rounded-xl shadow-2xl w-[calc(100vw-32px)] max-w-[360px] max-h-[80vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-800">
          <h2 className="text-[15px] font-bold text-gray-100">Settings</h2>
          <button
            onClick={() => setOpen(false)}
            className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* View mode — mobile only (desktop has header toggle) */}
          {isMobile && (
            <section>
              <h3 className="text-[12px] font-semibold text-surface-500 uppercase tracking-wider mb-3">View</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveView('chat')}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${
                    activeView === 'chat'
                      ? 'bg-surface-800 border-primary-500 text-primary-400'
                      : 'bg-surface-900 border-surface-700 text-surface-500 hover:border-surface-600'
                  }`}
                >
                  AI
                </button>
                <button
                  onClick={() => setActiveView('kanban')}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${
                    activeView === 'kanban'
                      ? 'bg-surface-800 border-primary-500 text-primary-400'
                      : 'bg-surface-900 border-surface-700 text-surface-500 hover:border-surface-600'
                  }`}
                >
                  Task
                </button>
              </div>
            </section>
          )}

          {/* Theme */}
          <section>
            <h3 className="text-[12px] font-semibold text-surface-500 uppercase tracking-wider mb-3">Appearance</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setTheme('dark')}
                className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${
                  theme === 'dark'
                    ? 'bg-surface-800 border-primary-500 text-primary-400'
                    : 'bg-surface-900 border-surface-700 text-surface-500 hover:border-surface-600'
                }`}
              >
                Dark
              </button>
              <button
                onClick={() => setTheme('light')}
                className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${
                  theme === 'light'
                    ? 'bg-surface-800 border-primary-500 text-primary-400'
                    : 'bg-surface-900 border-surface-700 text-surface-500 hover:border-surface-600'
                }`}
              >
                Light
              </button>
            </div>
          </section>

          {/* Dev Tools */}
          {onBrowserOpen && (
            <section>
              <h3 className="text-[12px] font-semibold text-surface-500 uppercase tracking-wider mb-3">Dev Tools</h3>
              <button
                onClick={() => {
                  setOpen(false);
                  onBrowserOpen();
                }}
                className="w-full py-2.5 text-xs font-semibold text-blue-400 border border-blue-500/30 hover:bg-blue-500/10 rounded-lg transition-all"
              >
                Browser Panel
              </button>
            </section>
          )}

          {/* My Skills */}
          <MySkillsSection />

          {/* Logout */}
          <section>
            <button
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="w-full py-2.5 text-xs font-semibold text-red-400 border border-red-500/30 hover:bg-red-500/10 rounded-lg transition-all"
            >
              Logout
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function MySkillsSection() {
  const [skills, setSkills] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', content: '' });

  const token = localStorage.getItem('token');
  const hdrs: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) hdrs['Authorization'] = `Bearer ${token}`;

  const load = useCallback(() => {
    fetch('/api/skills?scope=personal', { headers: hdrs })
      .then(r => r.ok ? r.json() : [])
      .then(setSkills)
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name || !form.content) return;
    const content = form.content.startsWith('---')
      ? form.content
      : `---\nname: ${form.name}\ndescription: ${form.description || form.name}\n---\n\n${form.content}`;
    await fetch('/api/skills', {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({ name: form.name, scope: 'personal', description: form.description, content }),
    });
    setCreating(false);
    setForm({ name: '', description: '', content: '' });
    load();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/skills/${id}`, { method: 'DELETE', headers: hdrs });
    load();
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[12px] font-semibold text-surface-500 uppercase tracking-wider">My Skills</h3>
        <button onClick={() => setCreating(!creating)}
          className="text-[11px] text-primary-400 hover:text-primary-300 transition-colors">
          {creating ? 'Cancel' : '+ New'}
        </button>
      </div>

      {creating && (
        <div className="space-y-2 mb-3">
          <input placeholder="Skill name" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full bg-surface-900 border border-surface-700 rounded-lg px-3 py-1.5 text-[12px] text-gray-200 focus:border-primary-500/50 focus:outline-none" />
          <input placeholder="Description" value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="w-full bg-surface-900 border border-surface-700 rounded-lg px-3 py-1.5 text-[12px] text-gray-200 focus:border-primary-500/50 focus:outline-none" />
          <textarea placeholder="Skill instructions (markdown)" value={form.content}
            onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            rows={4}
            className="w-full bg-surface-900 border border-surface-700 rounded-lg px-3 py-1.5 text-[12px] text-gray-200 font-mono focus:border-primary-500/50 focus:outline-none resize-y" />
          <button onClick={handleCreate}
            className="w-full py-1.5 text-[11px] font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-500 transition-colors">
            Create Personal Skill
          </button>
        </div>
      )}

      {skills.length === 0 && !creating && (
        <p className="text-[12px] text-gray-500 py-2">No personal skills. Create one to add custom /{'{name}'} commands.</p>
      )}

      <div className="space-y-1">
        {skills.map((s: any) => (
          <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-800/50 group">
            <span className="text-primary-500/70 font-mono text-[12px]">/</span>
            <span className="text-[12px] text-gray-200 font-medium">{s.name}</span>
            <span className="text-[11px] text-gray-500 truncate flex-1">{s.description}</span>
            <button onClick={() => handleDelete(s.id)}
              className="text-[10px] text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
              Del
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
