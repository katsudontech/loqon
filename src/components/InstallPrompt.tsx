'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

type BeforeInstallPromptChoice = {
  outcome: 'accepted' | 'dismissed';
  platform: string;
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<BeforeInstallPromptChoice>;
}

const isBeforeInstallPromptEvent = (event: Event): event is BeforeInstallPromptEvent => (
  'prompt' in event
  && typeof event.prompt === 'function'
  && 'userChoice' in event
);

const getEnvironmentSnapshot = () => {
  const dismissedValue = localStorage.getItem('pwa-prompt-dismissed');
  const dismissedAt = dismissedValue ? Number.parseInt(dismissedValue, 10) : 0;
  const isDismissed = Number.isFinite(dismissedAt)
    && Date.now() - dismissedAt < 1000 * 60 * 60 * 24 * 30;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && navigator.standalone === true);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  return [isDismissed, isStandalone, isIOS].map(String).join('|');
};

const getEnvironmentServerSnapshot = () => null;

const subscribeToEnvironment = (onStoreChange: () => void) => {
  const standaloneQuery = window.matchMedia('(display-mode: standalone)');
  standaloneQuery.addEventListener('change', onStoreChange);
  window.addEventListener('storage', onStoreChange);

  return () => {
    standaloneQuery.removeEventListener('change', onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
};

export const InstallPrompt = () => {
  const environment = useSyncExternalStore(
    subscribeToEnvironment,
    getEnvironmentSnapshot,
    getEnvironmentServerSnapshot,
  );
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissedForSession, setIsDismissedForSession] = useState(false);

  useEffect(() => {
    // Android (Chrome) のインストールダイアログ捕捉
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      if (isBeforeInstallPromptEvent(e)) {
        setDeferredPrompt(e);
      }
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  if (environment === null) return null;

  const [isDismissed, isStandalone, isIOS] = environment
    .split('|')
    .map(value => value === 'true');

  // すでにPWAとして起動しているか、非表示にされた場合は何も表示しない
  if (isStandalone || isDismissed || isDismissedForSession) return null;

  // iOSでもなく、Androidのインストールダイアログも捕捉できていない場合は表示しない（PCブラウザ等）
  if (!isIOS && !deferredPrompt) return null;

  const dismiss = () => {
    localStorage.setItem('pwa-prompt-dismissed', Date.now().toString());
    setIsDismissedForSession(true);
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        dismiss(); // インストール成功したら非表示にする
      }
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:w-[400px] bg-zinc-900 border border-indigo-500/30 shadow-[0_0_50px_rgba(99,102,241,0.15)] rounded-2xl p-5 z-[100] animate-in slide-in-from-bottom-8 fade-in duration-500">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="text-xl">📱</span>
          </div>
          <h3 className="font-bold text-white text-lg leading-tight">ホーム画面に<br/>追加推奨！</h3>
        </div>
        <button onClick={dismiss} className="text-zinc-500 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-zinc-800 -mt-1 -mr-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="text-zinc-300 text-sm leading-relaxed mb-4 bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50">
        アプリを「ホーム画面に追加（PWA化）」すると、<strong>通信量が大幅に削減</strong>されます！<br />
        <span className="text-red-400 font-bold text-[13px] mt-2 block flex items-start gap-1.5">
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          逆にしないと、7日以上経つと再び音源のダウンロード（通信）が始まってしまいます。
        </span>
      </div>

      {isIOS ? (
        <div className="bg-indigo-950/40 rounded-xl p-3 border border-indigo-900/50 flex flex-col gap-2.5">
          <p className="text-sm text-indigo-100 font-medium flex items-center gap-2">
            <span className="bg-indigo-500/20 text-indigo-300 w-5 h-5 rounded-full flex items-center justify-center text-xs">1</span>
            画面下部の <svg className="w-5 h-5 inline text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg> （共有ボタン）をタップ
          </p>
          <p className="text-sm text-indigo-100 font-medium flex items-center gap-2">
            <span className="bg-indigo-500/20 text-indigo-300 w-5 h-5 rounded-full flex items-center justify-center text-xs">2</span>
            「ホーム画面に追加 <svg className="w-5 h-5 inline text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg> 」を選択
          </p>
        </div>
      ) : (
        <button 
          onClick={handleInstallClick}
          className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-base rounded-xl shadow-lg transition-all active:scale-[0.98] flex justify-center items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          ホーム画面に追加する
        </button>
      )}
    </div>
  );
};
