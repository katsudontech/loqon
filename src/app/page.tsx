import Link from "next/link";

export default function Home() {
  return (
    <div className="home-shell">
      <div className="home-grid">
        <section aria-labelledby="home-title">
          <p className="eyebrow">Paper frame / stage console</p>
          <h1 id="home-title" className="home-title">構成図と音源を、<em>ひとつの練習画面</em>に。</h1>
          <p className="home-copy">PDFのフォーメーション図と音源を同期。パートごとの区切りをチームで共有し、練習の流れを止めずに確認できます。</p>
          <div className="home-actions">
            <Link href="/create" className="button">プロジェクトを作成する <span aria-hidden="true">→</span></Link>
            <Link href="/select" className="button-secondary">最近見たショーケース</Link>
          </div>
        </section>
        <section className="stage-preview" aria-label="プレイヤー画面のプレビュー">
          <div className="stage-preview-top"><span>LOQON / PLAYER</span><span>01 — 04</span></div>
          <div className="stage-preview-body">
            <div className="paper-preview">
              <h3>FORMATION / PART 01</h3>
              <div className="formation-row"><span className="formation-dot" /><span className="formation-dot active" /><span className="formation-dot" /></div>
              <div className="formation-row"><span className="formation-dot active" /><span className="formation-dot" /><span className="formation-dot active" /></div>
              <div className="preview-rule" /><div className="preview-rule short" />
              <div className="formation-row"><span className="formation-dot" /><span className="formation-dot" /><span className="formation-dot active" /></div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
