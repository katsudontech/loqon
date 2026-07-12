import Link from "next/link";

export default function Home() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 relative overflow-hidden py-24">
      {/* Background glow effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-3xl w-full text-center z-10 space-y-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm text-sm font-medium text-zinc-300">
          <span className="flex h-2 w-2 rounded-full bg-indigo-500"></span>
          ショーケースの練習を、もっとスマートに。
        </div>

        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white leading-[1.1]">
          Sync your <br className="hidden sm:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
            formations
          </span> & <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">music</span>
        </h1>

        <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          構成図（PDF）と音源（MP3）をアップロードするだけ。
          音楽に合わせて自動でページが切り替わる、最高のダンス練習環境をチームに共有しましょう。
        </p>

        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/create"
            className="group relative inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-4 bg-white text-black font-semibold rounded-full overflow-hidden transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-100 to-purple-100 opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="relative">プロジェクトを作成</span>
            <svg
              className="relative w-4 h-4 transition-transform group-hover:translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
          
          <button
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-4 bg-zinc-900 border border-zinc-800 text-zinc-300 font-medium rounded-full hover:bg-zinc-800 hover:text-white transition-colors"
          >
            デモを見る
          </button>
        </div>
      </div>
      
      {/* Decorative UI elements for a premium feel */}
      <div className="mt-24 relative w-full max-w-4xl mx-auto">
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent z-10" />
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md p-4 overflow-hidden shadow-2xl relative">
          
          {/* Mac-style window buttons */}
          <div className="flex items-center gap-2 pb-4 border-b border-zinc-800/50">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>

          <div className="h-[250px] sm:h-[400px] w-full flex flex-col items-center justify-center relative p-8">
            
            {/* Fake PDF Page display */}
            <div className="w-full max-w-md aspect-[4/3] bg-zinc-800/50 rounded-lg border border-zinc-700/50 flex items-center justify-center mb-8 relative overflow-hidden">
               <div className="absolute top-4 left-4 w-12 h-4 bg-zinc-700/50 rounded-sm" />
               <div className="flex gap-4">
                 <div className="w-8 h-8 rounded-full bg-indigo-500/50" />
                 <div className="w-8 h-8 rounded-full bg-purple-500/50 translate-y-4" />
                 <div className="w-8 h-8 rounded-full bg-pink-500/50" />
               </div>
            </div>

            {/* Fake Waveform / Timeline */}
            <div className="w-full h-16 flex items-end gap-1 opacity-60">
              {[...Array(60)].map((_, i) => (
                <div 
                  key={i} 
                  className={`flex-1 rounded-t-sm transition-all duration-500 ${i < 20 ? 'bg-indigo-500' : 'bg-zinc-700'}`}
                  style={{ height: `${Math.max(10, (i * 17) % 90)}%` }}
                />
              ))}
            </div>
            
            {/* Playhead */}
            <div className="absolute bottom-8 left-[33%] w-0.5 h-20 bg-white/80 shadow-[0_0_10px_white]">
               <div className="absolute -top-2 -left-1.5 w-3.5 h-3.5 rounded-full bg-white" />
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
