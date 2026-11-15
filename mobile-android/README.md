# SoundClear Android (Standalone Native)

Aplikasi Android mandiri untuk **SoundClear** (`© 2026 zhafx.corp`) yang dibangun sepenuhnya dengan **Kotlin**, **Jetpack Compose**, dan **Media3 ExoPlayer** tanpa WebView dan tanpa bergantung pada server eksternal.

## Fitur Utama
- **Beranda & Tangga Lagu Indonesia**: Mengambil katalog langsung via YouTube Music InnerTube.
- **Pencarian Langsung**: Cari lagu/video beserta riwayat pencarian tersimpan lokal.
- **Pemutaran Audio Langsung & Latar Belakang**: Ekstraksi stream audio langsung + `MediaSessionService` untuk kontrol notifikasi & layar kunci.
- **Lirik Tersinkronisasi**: Mengambil lirik LRC dari `LRCLIB` dengan sorotan baris aktif otomatis.
- **Pustaka Lokal & Offline**: Lagu disukai, riwayat putar, serta pemindai file audio perangkat (`MediaStore`: MP3, FLAC, WAV, OGG, M4A).
- **DSP Hardware Android**: `Equalizer` multi-band + preset + `BassBoost`.

## Cara Mengompilasi menjadi `.apk`

### Opsi 1: Otomatis lewat GitHub Actions (Tanpa perlu Android Studio)
1. Push repositori ini ke GitHub.
2. Buka tab **Actions** → pilih workflow **Build Android APK** → klik **Run workflow**.
3. Setelah selesai, unduh file **`SoundClear-debug-apk`** dari bagian **Artifacts** dan pasang di HP Android.

### Opsi 2: Lokal lewat Android Studio / Gradle
1. Buka folder `mobile-android/` di **Android Studio** (Jellyfish / Ladybug atau lebih baru).
2. Tunggu Gradle sinkronisasi selesai, lalu klik **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
3. Atau melalui terminal (memerlukan JDK 17 + Android SDK + Gradle 8.11+):
   ```bash
   cd mobile-android
   gradle assembleDebug
   ```
   Hasil APK berada di `mobile-android/app/build/outputs/apk/debug/app-debug.apk`.
