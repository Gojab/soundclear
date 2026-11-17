import { useState } from 'react';
import { CheckCircle2, Download, Share2, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../utils/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'card';
}

export function PWAInstallButton({ variant = 'compact' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, isAndroid, isSafari, isFirefox, install } =
    usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (variant === 'compact') {
    if (isInstalled) return null;
    if (!isInstallable && !isIOS && !isSafari && !(isAndroid && isFirefox)) return null;

    return (
      <>
        <button
          type="button"
          onClick={() => {
            if (isInstallable) {
              void install();
            } else {
              setShowGuide(true);
            }
          }}
          className="inline-flex items-center justify-center gap-2 min-w-[44px] min-h-[44px] rounded-full bg-gradient-to-br from-[#19EE8A] via-[#0AD36C] to-[#01BA53] px-4 py-2 text-xs font-bold text-[#0F1F17] hover:brightness-105 active:scale-95 transition shrink-0 shadow-sm shadow-[#0AD36C]/25 cursor-pointer"
          aria-label={isInstallable ? 'Pasang Aplikasi SoundClear' : 'Panduan Pasang Aplikasi'}
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden lg:inline whitespace-nowrap">Pasang App</span>
        </button>

        {showGuide && (
          <InstallGuideModal
            isIOS={isIOS}
            isFirefox={isFirefox}
            isAndroid={isAndroid}
            onClose={() => setShowGuide(false)}
          />
        )}
      </>
    );
  }

  return (
    <div className="bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] rounded-xl p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#19EE8A] via-[#0AD36C] to-[#01BA53] text-[#0F1F17] flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[#E8FFF3]">
              Pasang Aplikasi (PWA) &amp; Putar Latar Belakang
            </h3>
            <p className="text-xs text-[#B3F7D1]/70 mt-1 leading-relaxed max-w-[65ch]">
              Instal SoundClear ke layar utama untuk membantu pemutaran berlanjut saat berpindah aplikasi
              atau layar terkunci. Browser atau aplikasi yang ditutup paksa dapat menghentikan pemutaran.
            </p>
          </div>
        </div>

        {isInstalled ? (
          <span className="inline-flex items-center gap-2 min-h-[40px] rounded-full bg-[#0AD36C]/15 border border-[#0AD36C]/35 px-4 py-2 text-xs font-semibold text-[#19EE8A] shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Terpasang
          </span>
        ) : isInstallable ? (
          <button
            type="button"
            onClick={() => void install()}
            className="inline-flex items-center gap-2 min-h-[44px] rounded-full bg-gradient-to-br from-[#19EE8A] via-[#0AD36C] to-[#01BA53] px-4 py-2 text-xs font-bold text-[#0F1F17] hover:brightness-105 transition shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Pasang Sekarang
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="inline-flex items-center gap-2 min-h-[44px] rounded-full border border-[#19EE8A]/40 bg-white/[0.06] backdrop-blur-md px-4 py-2 text-xs font-semibold text-[#19EE8A] hover:bg-white/[0.11] transition shrink-0 cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            Cara Pasang
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-[#B3F7D1]/80">
        <div className="rounded-xl bg-white/[0.045] backdrop-blur-md border border-white/[0.09] p-4">
          <div className="font-semibold text-[#E8FFF3] mb-1">Chrome / Edge / Firefox</div>
          <p className="text-[#B3F7D1]/70 leading-relaxed max-w-[65ch]">
            Gunakan tombol Pasang di Chrome/Edge (Android, Windows, macOS, Linux) atau menu
            Instal di Firefox Android. Hindari menutup paksa aplikasi saat mendengarkan.
          </p>
        </div>
        <div className="rounded-xl bg-white/[0.045] backdrop-blur-md border border-white/[0.09] p-4">
          <div className="font-semibold text-[#E8FFF3] mb-1">Safari (iPhone / iPad / Mac)</div>
          <p className="text-[#B3F7D1]/70 leading-relaxed max-w-[65ch]">
            Ketuk Bagikan (<span className="text-[#19EE8A]">Share</span>) lalu pilih{' '}
            <span className="text-[#E8FFF3] font-medium">Tambah ke Layar Utama / Dock</span> untuk
            kontrol layar kunci &amp; pemutaran latar belakang sesuai dukungan iOS/macOS.
          </p>
        </div>
      </div>

      {showGuide && (
        <InstallGuideModal
          isIOS={isIOS}
          isFirefox={isFirefox}
          isAndroid={isAndroid}
          onClose={() => setShowGuide(false)}
        />
      )}
    </div>
  );
}

function InstallGuideModal({
  isIOS,
  isFirefox,
  isAndroid,
  onClose,
}: {
  isIOS: boolean;
  isFirefox: boolean;
  isAndroid: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
      role="dialog"
      aria-modal="true"
      aria-label="Panduan Pasang Aplikasi SoundClear"
    >
      <div className="w-full max-w-md rounded-2xl bg-[#0B0F0D]/85 backdrop-blur-2xl border border-white/[0.14] p-6 shadow-2xl max-h-[90dvh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-[#E8FFF3]">
              {isIOS ? 'Pasang di iPhone / iPad (Safari)' : 'Pasang SoundClear sebagai Aplikasi'}
            </h3>
            <p className="text-xs text-[#B3F7D1]/70 mt-1 leading-relaxed max-w-[65ch]">
              Untuk pemutaran di latar belakang saat aplikasi diminimalkan atau layar terkunci. Menutup paksa browser/aplikasi dapat menghentikan audio.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-full bg-white/[0.07] text-[#B3F7D1] hover:text-[#E8FFF3] hover:bg-white/[0.12] flex items-center justify-center transition cursor-pointer shrink-0"
            aria-label="Tutup panduan instalasi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <ol className="mt-4 space-y-2 text-sm leading-relaxed text-[#B3F7D1]">
          {isIOS ? (
            <>
              <li className="rounded-xl bg-white/[0.055] p-4 border border-white/[0.1] max-w-[65ch]">
                1. Ketuk tombol <strong className="text-[#E8FFF3]">Bagikan (Share)</strong> di
                bilah bawah/atas Safari.
              </li>
              <li className="rounded-xl bg-white/[0.055] p-4 border border-white/[0.1] max-w-[65ch]">
                2. Gulir ke bawah dan ketuk{' '}
                <strong className="text-[#19EE8A]">Tambah ke Layar Utama</strong> (Add to Home
                Screen).
              </li>
              <li className="rounded-xl bg-white/[0.055] p-4 border border-white/[0.1] max-w-[65ch]">
                3. Buka ikon <strong className="text-[#E8FFF3]">SoundClear</strong> dari layar
                utama untuk pemutaran latar belakang stabil.
              </li>
            </>
          ) : (
            <>
              <li className="rounded-xl bg-white/[0.055] p-4 border border-white/[0.1] max-w-[65ch]">
                1. Di <strong className="text-[#E8FFF3]">Chrome / Edge</strong>: klik ikon instal
                di sebelah kanan bilah alamat atau menu{' '}
                <strong className="text-[#19EE8A]">Simpan &amp; Bagikan → Instal Aplikasi</strong>.
              </li>
              <li className="rounded-xl bg-white/[0.055] p-4 border border-white/[0.1] max-w-[65ch]">
                2. Di <strong className="text-[#E8FFF3]">Safari Mac</strong>: klik{' '}
                <strong className="text-[#19EE8A]">File → Add to Dock</strong>.{' '}
                {isFirefox && isAndroid
                  ? 'Di Firefox Android: buka menu (⋮) lalu pilih Instal.'
                  : 'Di Firefox Desktop: instalasi PWA bawaan tidak tersedia, gunakan tab browser atau Chrome/Edge.'}
              </li>
              <li className="rounded-xl bg-white/[0.055] p-4 border border-white/[0.1] max-w-[65ch]">
                3. Saat dibuka kembali setelah browser ditutup, ketuk{' '}
                <strong className="text-[#E8FFF3]">Lanjutkan Pemutaran</strong> bila browser
                meminta izin pemutaran otomatis.
              </li>
            </>
          )}
        </ol>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full min-h-[44px] rounded-full bg-gradient-to-br from-[#19EE8A] via-[#0AD36C] to-[#01BA53] py-2 text-sm font-bold text-[#0F1F17] hover:brightness-105 transition cursor-pointer"
        >
          Mengerti
        </button>
      </div>
    </div>
  );
}
