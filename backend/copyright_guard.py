from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from typing import Any, Dict, List, Optional


COPYRIGHT_OWNER = "zhafx.corp"
COPYRIGHT_YEAR = "2026"
COPYRIGHT_NOTICE = "© 2026 zhafx.corp"
PRODUCT_NAME = "SoundClear"

COPYRIGHT_RULES: List[str] = [
    "Hak cipta merek, antarmuka, dan kode sumber SoundClear sepenuhnya dimiliki oleh zhafx.corp.",
    "Atribusi '© 2026 zhafx.corp' wajib ditampilkan dan tidak boleh dihapus, disembunyikan, atau diganti oleh pihak yang menggunakan berkas aplikasi ini.",
    "Penghapusan atau perubahan aturan hak cipta pada backend maupun frontend ditolak secara otomatis tanpa kata sandi otorisasi zhafx.corp.",
    "Modifikasi atau penghapusan atribut hak cipta tanpa otorisasi memicu penguncian API backend (HTTP 451) hingga integritas hak cipta dipulihkan.",
]

# Salted PBKDF2-HMAC-SHA256 verifier (never stores plaintext password)
_PASSWORD_SALT_HEX = "cba57d19a785e319f073bec6041e4515"
_PASSWORD_HASH_HEX = "e5a133b3e78eda59496519716a55a2b0d96f856e62765b8d634a17c608cf2da2"
_PBKDF2_ITERATIONS = 210_000
_EXPECTED_RULES_DIGEST = "921e2c2bee2e70d81fcbc8432b8cf41fced7a04d1152c02ae220371ad817e8cd"

_DEFAULT_CUSTOM_NOTE = (
    "Dilindungi oleh zhafx.corp Copyright Guard. "
    "Setiap distribusi atau penggunaan berkas aplikasi wajib mempertahankan atribusi resmi zhafx.corp."
)


class CopyrightGuardError(Exception):
    def __init__(self, status_code: int, message: str, code: str = "ZHAFX_COPYRIGHT_LOCKED") -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.code = code


def compute_rules_digest(
    owner: str = COPYRIGHT_OWNER,
    year: str = COPYRIGHT_YEAR,
    notice: str = COPYRIGHT_NOTICE,
    product: str = PRODUCT_NAME,
    rules: Optional[List[str]] = None,
) -> str:
    payload = json.dumps(
        {
            "owner": owner,
            "year": year,
            "notice": notice,
            "product": product,
            "rules": rules if rules is not None else COPYRIGHT_RULES,
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def verify_password_hash(
    password: str,
    *,
    salt_hex: str = _PASSWORD_SALT_HEX,
    expected_hash_hex: str = _PASSWORD_HASH_HEX,
    iterations: int = _PBKDF2_ITERATIONS,
) -> bool:
    if not isinstance(password, str) or not password:
        return False
    try:
        salt = bytes.fromhex(salt_hex)
        derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations).hex()
        return hmac.compare_digest(derived, expected_hash_hex)
    except Exception:
        return False


class CopyrightGuard:
    def __init__(
        self,
        *,
        project_root: Optional[str] = None,
        salt_hex: str = _PASSWORD_SALT_HEX,
        password_hash_hex: str = _PASSWORD_HASH_HEX,
        iterations: int = _PBKDF2_ITERATIONS,
    ) -> None:
        self._lock = threading.Lock()
        self._project_root = project_root or os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..")
        )
        self._salt_hex = salt_hex
        self._password_hash_hex = password_hash_hex
        self._iterations = iterations
        self._signing_secret = hashlib.sha256(
            f"{password_hash_hex}:{secrets.token_hex(16)}".encode("utf-8")
        ).digest()
        self._custom_note = _DEFAULT_CUSTOM_NOTE
        self._notice = COPYRIGHT_NOTICE
        self._failed_attempts = 0
        self._locked_until = 0.0
        self._load_state()

    def _state_file_path(self) -> str:
        if os.environ.get("VERCEL") or not os.access(os.path.dirname(__file__), os.W_OK):
            return "/tmp/soundclear_copyright_state.json"
        return os.path.join(os.path.dirname(__file__), ".copyright_state.json")

    def _load_state(self) -> None:
        path = self._state_file_path()
        if not os.path.isfile(path):
            return
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            if isinstance(data, dict):
                note = data.get("customNote")
                notice = data.get("notice")
                if isinstance(note, str) and note.strip():
                    self._custom_note = note.strip()
                if isinstance(notice, str) and COPYRIGHT_OWNER.lower() in notice.lower():
                    self._notice = notice.strip()
        except Exception:
            pass

    def _save_state(self) -> None:
        path = self._state_file_path()
        try:
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(
                    {
                        "owner": COPYRIGHT_OWNER,
                        "notice": self._notice,
                        "customNote": self._custom_note,
                        "updatedAt": int(time.time()),
                    },
                    fh,
                    ensure_ascii=False,
                    indent=2,
                )
        except Exception:
            pass

    def verify_password(self, password: str) -> bool:
        now = time.time()
        with self._lock:
            if now < self._locked_until:
                wait_sec = max(1, int(self._locked_until - now))
                raise CopyrightGuardError(
                    429,
                    f"Terlalu banyak percobaan kata sandi gagal. Coba lagi dalam {wait_sec} detik.",
                    code="ZHAFX_RATE_LIMITED",
                )

        ok = verify_password_hash(
            password,
            salt_hex=self._salt_hex,
            expected_hash_hex=self._password_hash_hex,
            iterations=self._iterations,
        )

        with self._lock:
            if ok:
                self._failed_attempts = 0
                self._locked_until = 0.0
            else:
                self._failed_attempts += 1
                if self._failed_attempts >= 5:
                    self._locked_until = time.time() + 15.0
                    self._failed_attempts = 0
        return ok

    def issue_token(self, ttl_seconds: int = 900) -> Dict[str, Any]:
        expires_at = int(time.time()) + ttl_seconds
        nonce = secrets.token_hex(8)
        payload = f"{COPYRIGHT_OWNER}:{expires_at}:{nonce}"
        sig = hmac.new(self._signing_secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()
        return {
            "token": f"{payload}:{sig}",
            "expiresAt": expires_at,
        }

    def verify_token(self, token: Optional[str]) -> bool:
        if not token or not isinstance(token, str):
            return False
        parts = token.strip().split(":")
        if len(parts) != 4:
            return False
        owner, exp_str, nonce, sig = parts
        if owner != COPYRIGHT_OWNER or not nonce:
            return False
        try:
            expires_at = int(exp_str)
        except ValueError:
            return False
        if time.time() > expires_at:
            return False
        payload = f"{owner}:{exp_str}:{nonce}"
        expected_sig = hmac.new(
            self._signing_secret, payload.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(sig, expected_sig)

    def authorize(self, *, password: Optional[str] = None, token: Optional[str] = None) -> bool:
        if token and self.verify_token(token):
            return True
        if password is not None and password != "":
            return self.verify_password(password)
        return False

    def verify_integrity(self) -> Dict[str, Any]:
        digest = compute_rules_digest()
        if COPYRIGHT_OWNER != "zhafx.corp" or "zhafx.corp" not in COPYRIGHT_NOTICE:
            return {
                "valid": False,
                "reason": "Konstanta pemilik atau pemberitahuan hak cipta zhafx.corp telah dimodifikasi.",
                "digest": digest,
            }
        if digest != _EXPECTED_RULES_DIGEST:
            return {
                "valid": False,
                "reason": "Digest integritas aturan hak cipta zhafx.corp tidak cocok.",
                "digest": digest,
            }

        footer_path = os.path.join(self._project_root, "frontend", "src", "components", "Footer.tsx")
        if os.path.isfile(footer_path):
            try:
                with open(footer_path, "r", encoding="utf-8") as fh:
                    footer_src = fh.read()
                if "zhafx.corp" not in footer_src or "© 2026 zhafx.corp" not in footer_src:
                    return {
                        "valid": False,
                        "reason": "Atribusi '© 2026 zhafx.corp' dihapus dari komponen Footer.tsx.",
                        "digest": digest,
                    }
            except OSError:
                pass

        app_path = os.path.join(self._project_root, "frontend", "src", "App.tsx")
        if os.path.isfile(app_path):
            try:
                with open(app_path, "r", encoding="utf-8") as fh:
                    app_src = fh.read()
                if "<Footer" not in app_src:
                    return {
                        "valid": False,
                        "reason": "Komponen <Footer /> dihapus dari App.tsx.",
                        "digest": digest,
                    }
            except OSError:
                pass

        return {
            "valid": True,
            "reason": None,
            "digest": digest,
        }

    def get_info(self) -> Dict[str, Any]:
        integrity = self.verify_integrity()
        with self._lock:
            notice = self._notice
            custom_note = self._custom_note
        return {
            "owner": COPYRIGHT_OWNER,
            "year": COPYRIGHT_YEAR,
            "notice": notice,
            "product": PRODUCT_NAME,
            "locked": True,
            "passwordProtected": True,
            "deletable": False,
            "customNote": custom_note,
            "rules": list(COPYRIGHT_RULES),
            "integrity": integrity,
        }

    def update_info(
        self,
        *,
        password: Optional[str] = None,
        token: Optional[str] = None,
        custom_note: Optional[str] = None,
        notice: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not self.authorize(password=password, token=token):
            raise CopyrightGuardError(
                403,
                "Akses ditolak: kata sandi hak cipta zhafx.corp salah atau tidak disertakan.",
                code="ZHAFX_INVALID_PASSWORD",
            )

        with self._lock:
            if notice is not None:
                clean_notice = notice.strip()
                if not clean_notice or COPYRIGHT_OWNER.lower() not in clean_notice.lower():
                    raise CopyrightGuardError(
                        400,
                        "Aturan hak cipta: teks pemberitahuan wajib tetap mencantumkan 'zhafx.corp'.",
                        code="ZHAFX_IMMUTABLE_OWNER",
                    )
                self._notice = clean_notice

            if custom_note is not None:
                clean_note = custom_note.strip()
                if not clean_note:
                    raise CopyrightGuardError(
                        400,
                        "Catatan legal tambahan tidak boleh kosong.",
                        code="ZHAFX_EMPTY_NOTE",
                    )
                self._custom_note = clean_note

            self._save_state()

        return self.get_info()

    def attempt_delete(
        self,
        *,
        password: Optional[str] = None,
        token: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not self.authorize(password=password, token=token):
            raise CopyrightGuardError(
                403,
                "Penghapusan ditolak: bagian hak cipta zhafx.corp dilindungi aturan sistem dan kata sandi.",
                code="ZHAFX_DELETE_FORBIDDEN",
            )

        with self._lock:
            self._notice = COPYRIGHT_NOTICE
            self._custom_note = _DEFAULT_CUSTOM_NOTE
            self._save_state()

        return {
            "deleted": False,
            "resetToBaseline": True,
            "message": (
                "Hak cipta inti zhafx.corp bersifat permanen dan tidak dapat dihapus. "
                "Konfigurasi dikembalikan ke standar resmi © 2026 zhafx.corp."
            ),
            "copyright": self.get_info(),
        }
