'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { OfflineProject } from '@/lib/offline/types';
import { listOfflineProjects } from '@/lib/offline/db';

type RecentProject = {
  id: string;
  title: string;
  lastVisited: number;
};

const storageKey = 'recent_projects';

const subscribeToRecentProjects = (onStoreChange: () => void) => {
  window.addEventListener('storage', onStoreChange);
  return () => window.removeEventListener('storage', onStoreChange);
};

const getRecentProjectsSnapshot = () => localStorage.getItem(storageKey) ?? '';
const getRecentProjectsServerSnapshot = () => null;

const isRecentProject = (value: unknown): value is RecentProject => (
  typeof value === 'object'
  && value !== null
  && 'id' in value
  && typeof value.id === 'string'
  && 'title' in value
  && typeof value.title === 'string'
  && 'lastVisited' in value
  && typeof value.lastVisited === 'number'
);

export default function SelectPage() {
  const router = useRouter();
  const [savedProjects, setSavedProjects] = useState<OfflineProject[]>([]);
  useEffect(() => { void listOfflineProjects().then(setSavedProjects).catch(() => setSavedProjects([])); }, []);
  const storedProjects = useSyncExternalStore(
    subscribeToRecentProjects,
    getRecentProjectsSnapshot,
    getRecentProjectsServerSnapshot,
  );
  const projects = useMemo(() => {
    if (!storedProjects) return [];
    try {
      const parsed: unknown = JSON.parse(storedProjects);
      return Array.isArray(parsed) ? parsed.filter(isRecentProject) : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  }, [storedProjects]);
  const mergedProjects = useMemo(() => {
    const byId = new Map(projects.map((project) => [project.id, project]));
    for (const project of savedProjects) byId.set(project.id, { id: project.id, title: project.title, lastVisited: project.savedAt });
    return [...byId.values()].sort((a, b) => b.lastVisited - a.lastVisited);
  }, [projects, savedProjects]);
  const isLoaded = storedProjects !== null;

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="page-shell narrow">
      <div className="section-heading">
        <div><p className="eyebrow">Recent showcases</p><h1 className="page-title">最近のショーケース</h1><p className="page-lede">この端末で最近開いたプロジェクト。</p></div>
        <Link href="/" className="button-quiet">トップへ</Link>
      </div>

        {!isLoaded ? (
          <div className="empty-panel" aria-live="polite">
            <p>履歴を読み込んでいます…</p>
          </div>
        ) : mergedProjects.length === 0 ? (
          <div className="empty-panel">
            <h2>履歴がありません</h2>
            <p>
              プロジェクトを作成するか、共有されたURLを開くと、ここに履歴が残ります。
            </p>
            <Link href="/create" className="button">
              新しく作成する
            </Link>
          </div>
        ) : (
          <div className="recent-list">
            {mergedProjects.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => {
                  if (savedProjects.some((saved) => saved.id === p.id)) window.location.assign(`/offline?project=${encodeURIComponent(p.id)}`)
                  else router.push(`/${p.id}`)
                }}
                className="recent-item"
              >
                <div>
                  <span className="recent-title">{p.title}</span>
                  <span className="recent-id">ID: {p.id.slice(0, 8)}...</span>
                </div>
                <div>
                  <span className="recent-date">{formatDate(p.lastVisited)}</span>
                  <span aria-hidden="true">→</span>
                </div>
              </button>
            ))}
          </div>
        )}
    </div>
  );
}
