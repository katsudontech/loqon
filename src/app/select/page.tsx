'use client';

import { useMemo, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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
        ) : projects.length === 0 ? (
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
            {projects.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => router.push(`/${p.id}`)}
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
