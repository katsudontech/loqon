import Link from "next/link";

export default function Home() {
  return (
    <div className="home-shell">
      <div className="home-grid">
        <section aria-labelledby="home-title">
          <p className="eyebrow">Paper frame / stage console</p>
          <h1 id="home-title" className="home-title">フォーメーションPDFと音源を同期して、<em>ダンス練習</em>を進める。</h1>
          <p className="home-copy">Loqonは、音源の再生に合わせて構成図のページを切り替える練習画面です。パートの区切りを登録すれば、止めずに次のフォーメーションを確認できます。</p>
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

      <section className="home-section" aria-labelledby="features-title">
        <div className="home-section-heading">
          <p className="eyebrow">Practice console</p>
          <h2 id="features-title">Loqonでできること</h2>
        </div>
        <ul className="feature-list">
          <li>
            <span className="feature-index" aria-hidden="true">01</span>
            <div><h3>ページを自動で切り替え</h3><p>音源のタイミングに合わせて、登録した構成図PDFのページを表示します。</p></div>
          </li>
          <li>
            <span className="feature-index" aria-hidden="true">02</span>
            <div><h3>パート練習とA-Bループ</h3><p>タイムラインの区切りからパートを選び、必要な範囲を繰り返し再生できます。</p></div>
          </li>
          <li>
            <span className="feature-index" aria-hidden="true">03</span>
            <div><h3>URLとタイムラインを共有</h3><p>保存したプロジェクトをURLで共有。タイムラインのページや名前も編集できます。</p></div>
          </li>
        </ul>
      </section>

      <section className="home-section home-section-steps" aria-labelledby="steps-title">
        <div className="home-section-heading">
          <p className="eyebrow">Start here</p>
          <h2 id="steps-title">使い方</h2>
        </div>
        <p className="home-copy">音源とPDFを登録したら、次の3ステップで準備できます。</p>
        <ol className="steps-list">
          <li><span className="step-number" aria-hidden="true">1</span><div><h3>構成を曲に合わせる</h3><p>音源を再生しながら、PDFページが切り替わる時刻だけを記録します。</p></div></li>
          <li><span className="step-number" aria-hidden="true">2</span><div><h3>パートを分ける</h3><p>構成の切り替え位置を確認しながら、練習したい区間を同じページ内も含めて設定します。</p></div></li>
          <li><span className="step-number" aria-hidden="true">3</span><div><h3>練習する</h3><p>ページの自動切り替え、パート練習、A-Bループで繰り返し確認できます。</p></div></li>
        </ol>
      </section>

      <section className="home-section home-section-inputs" aria-labelledby="inputs-title">
        <div className="home-section-heading">
          <p className="eyebrow">Before you create</p>
          <h2 id="inputs-title">用意するファイル</h2>
        </div>
        <div className="input-guide">
          <div>
            <h3>新規プロジェクトに必要なもの</h3>
            <p>音源ファイル1つと、構成図PDF（.pdf）1つ。どちらも1ファイル50MB以下です。</p>
          </div>
          <dl>
            <div><dt>音源</dt><dd>MP3、WAV、OGG / OGA、FLAC、M4A / MP4、AAC</dd></div>
            <div><dt>構成図</dt><dd>PDF（.pdf）</dd></div>
          </dl>
        </div>
      </section>

      <section className="home-cta" aria-labelledby="home-cta-title">
        <div>
          <p className="eyebrow">Ready when you are</p>
          <h2 id="home-cta-title">まずは1曲分の練習画面を作る</h2>
          <p>音源と構成図を登録して、チームで使えるタイムラインを準備しましょう。</p>
        </div>
        <div className="home-cta-actions">
          <Link href="/create" className="button">プロジェクトを作成する <span aria-hidden="true">→</span></Link>
          <Link href="/select" className="text-link">最近のプロジェクトを見る</Link>
        </div>
      </section>
    </div>
  );
}
