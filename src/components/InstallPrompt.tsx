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
    <div className="floating-notice">
      <div className="flex justify-between items-start gap-3">
        <div>
          <h3>ホーム画面に追加</h3>
        </div>
        <button type="button" onClick={dismiss} aria-label="インストール案内を閉じる" className="icon-button">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="field-help">
        「ホーム画面に追加」すると、ブラウザを開かずにすぐアクセスできます。
      </div>

      {isIOS ? (
        <div className="alert alert-warning">
          <p>
            <span>1. </span>
            画面下部の <svg className="install-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg> （共有ボタン）をタップ
          </p>
          <p>
            <span>2. </span>
            「ホーム画面に追加 <svg className="install-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg> 」を選択
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleInstallClick}
          className="button w-full"
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
