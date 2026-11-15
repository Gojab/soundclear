import { Keyboard } from 'lucide-react';

const SHORTCUTS: Array<{ keys: string; description: string }> = [
  { keys: 'Spasi', description: 'Putar atau jeda lagu yang sedang aktif' },
  { keys: 'Panah Kanan', description: 'Maju 5 detik' },
  { keys: 'Panah Kiri', description: 'Mundur 5 detik' },
  { keys: 'Shift + Panah Kanan', description: 'Lompat ke lagu berikutnya' },
  { keys: 'Shift + Panah Kiri', description: 'Kembali ke lagu sebelumnya atau awal lagu' },
  { keys: 'M', description: 'Bisukan atau nyalakan kembali suara' },
  { keys: 'L', description: 'Buka tab lirik atau mode karaoke layar penuh' },
  { keys: 'S', description: 'Aktifkan atau matikan acak urutan (Shuffle)' },
  { keys: 'R', description: 'Ubah mode ulang (Mati / Semua / Satu Lagu)' },
  { keys: '?', description: 'Buka halaman daftar pintasan keyboard ini' },
  { keys: 'Esc', description: 'Tutup dialog, menu konteks, atau tampilan layar penuh' },
];

export function ShortcutsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#19EE8A]/15 border border-[#19EE8A]/30 flex items-center justify-center text-[#19EE8A]">
          <Keyboard className="w-5 h-5" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[#E8FFF3] tracking-tight">
            Pintasan Keyboard
          </h1>
          <p className="text-xs text-[#B3F7D1]/60 mt-0.5">
            Kontrol pemutaran cepat tanpa menyentuh mouse
          </p>
        </div>
      </div>

      <div className="glass-card rounded-2xl divide-y divide-[#B3F7D1]/[0.08] overflow-hidden">
        {SHORTCUTS.map((item) => (
          <div
            key={item.keys}
            className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
          >
            <span className="text-[#E8FFF3]/85">{item.description}</span>
            <kbd className="px-2.5 py-1 rounded-lg bg-white/[0.07] backdrop-blur-md border border-white/[0.14] text-xs font-mono text-[#19EE8A] shrink-0">
              {item.keys}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}
