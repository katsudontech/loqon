'use client';

import { useEffect } from 'react';

type RecentProject = {
  id: string;
  title: string;
  lastVisited: number;
};

type Props = {
  projectId: string;
  title: string;
};

export const RecentProjectTracker = ({ projectId, title }: Props) => {
  useEffect(() => {
    try {
      const storageKey = 'recent_projects';
      const stored = localStorage.getItem(storageKey);
      let projects: RecentProject[] = [];

      if (stored) {
        projects = JSON.parse(stored);
      }

      // 既存の履歴があれば削除（後で先頭に追加するため）
      projects = projects.filter(p => p.id !== projectId);

      // 新しい履歴を先頭に追加
      projects.unshift({
        id: projectId,
        title: title || '名称未設定プロジェクト',
        lastVisited: Date.now(),
      });

      // 最大20件まで保存
      if (projects.length > 20) {
        projects = projects.slice(0, 20);
      }

      localStorage.setItem(storageKey, JSON.stringify(projects));
    } catch (err) {
      console.error('Failed to save recent project to localStorage', err);
    }
  }, [projectId, title]);

  // UIは一切持たない裏方のコンポーネント
  return null;
};
