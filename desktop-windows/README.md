# SoundClear Windows Desktop Notch

Pembungkus desktop **khusus Windows** agar pemutar mini notch melayang di luar jendela aplikasi/browser:
- Tanpa bingkai (`frameless`), latar belakang transparan dengan lekuk cekung atas, dan selalu berada di atas (`alwaysOnTop: screen-saver`).
- Otomatis berada di tengah atas monitor Windows pilihan (`Monitor Utama`, `Monitor Aktif (Posisi Kursor)`, atau monitor eksternal tertentu).
- Area transparan di luar pil notch tembus klik ke aplikasi Windows lain di bawahnya.

## Cara Menjalankan di Windows 10 / 11

```bash
cd desktop-windows
npm install
# Arahkan ke URL web SoundClear Anda (default http://localhost:3000)
set SOUNDCLEAR_URL=https://domain-vercel-anda.vercel.app
npm start
```

Untuk membuat file `.exe` / installer Windows:

```bash
npm run build:win
```
