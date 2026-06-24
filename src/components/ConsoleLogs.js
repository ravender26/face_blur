export default function ConsoleLogs({ consoleLogs }) {
  return (
    <div className="bg-[#0f131d]/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-2xl space-y-4">
      <h3 className="text-sm font-semibold text-slate-300">Console Logs</h3>
      <div className="bg-slate-950 p-4 rounded-xl max-h-48 overflow-y-auto font-mono text-[10px] text-slate-400 space-y-1">
        {consoleLogs.map((log, idx) => (
          <div
            key={idx}
            className={
              log.startsWith("[error]")
                ? "text-rose-400"
                : log.startsWith("[warn]")
                ? "text-amber-400"
                : "text-slate-400"
            }
          >
            {log}
          </div>
        ))}
        {consoleLogs.length === 0 && <div className="text-slate-600">No logs captured yet</div>}
      </div>
    </div>
  );
}
