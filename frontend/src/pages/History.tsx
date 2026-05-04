export default function History() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 text-center">
      <div className="max-w-sm flex flex-col items-center gap-6">

        <div className="relative">
          <div className="text-5xl">📋</div>
          <div className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            Pronto
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold text-zinc-100 mb-2">Historial de destinos</h2>
          <p className="text-sm text-zinc-500 leading-relaxed">
            Acá vas a poder ver todos los reportes que te generó NomadAI — con los destinos recomendados,
            scores de afinidad y links de alojamiento de cada búsqueda anterior.
          </p>
        </div>

        {/* Skeleton preview */}
        <div className="w-full flex flex-col gap-2.5 opacity-30 pointer-events-none">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-zinc-800 flex-shrink-0" />
              <div className="flex-1 flex flex-col gap-1.5">
                <div className="h-2.5 bg-zinc-800 rounded w-3/4" />
                <div className="h-2 bg-zinc-800 rounded w-1/2" />
              </div>
              <div className="h-2 bg-zinc-800 rounded w-10" />
            </div>
          ))}
        </div>

        <p className="text-xs text-zinc-600">Esta funcionalidad estará disponible próximamente</p>
      </div>
    </div>
  )
}
