'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type RecentProject = {
  id: string;
  title: string;
  lastVisited: number;
};

export default function SelectPage() {
  const [projects, setProjects] = useState<RecentProject[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    try {
      const stored = localStorage.getItem('recent_projects');
      if (stored) {
        setProjects(JSON.parse(stored));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-zinc-950 p-6 flex flex-col items-center pt-24">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Recent Showcases</h1>
            <p className="text-zinc-500 mt-2">最近開いたプロジェクト（ショーケース）</p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/10 px-4 py-2 rounded-full border border-indigo-500/20"
          >
            トップへ戻る
          </Link>
        </div>

        {!isLoaded ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16 bg-zinc-900/50 rounded-2xl border border-zinc-800">
            <div className="text-4xl mb-4 opacity-50">📂</div>
            <h2 className="text-xl font-bold text-zinc-300 mb-2">履歴がありません</h2>
            <p className="text-zinc-500 mb-6 text-sm">
              プロジェクトを作成するか、共有されたURLを開くと、ここに履歴が残ります。
            </p>
            <Link
              href="/create"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-black font-semibold rounded-full hover:bg-zinc-200 transition-colors"
            >
              新しく作成する
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/${p.id}`)}
                className="w-full text-left flex items-center justify-between p-5 bg-zinc-900 hover:bg-zinc-800/80 rounded-2xl border border-zinc-800 hover:border-indigo-500/30 transition-all group active:scale-[0.98]"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-bold text-zinc-100 group-hover:text-white transition-colors">
                    {p.title}
                  </span>
                  <span className="text-xs font-mono text-zinc-500">
                    ID: {p.id.slice(0, 8)}...
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-zinc-500 bg-zinc-950 px-3 py-1 rounded-full border border-zinc-800">
                    {formatDate(p.lastVisited)}
                  </span>
                  <svg
                    className="w-5 h-5 text-zinc-600 group-hover:text-indigo-400 transition-colors group-hover:translate-x-1 duration-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
