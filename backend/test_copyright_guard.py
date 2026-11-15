import hashlib
import os
import tempfile
import unittest
from unittest import mock

from fastapi.testclient import TestClient

import backend.main as main_app
from backend.copyright_guard import (
    COPYRIGHT_NOTICE,
    COPYRIGHT_OWNER,
    CopyrightGuard,
    compute_rules_digest,
)


class CopyrightGuardTests(unittest.TestCase):
    def _make_test_guard(self, project_root: str, test_password: str = "test-secret-key") -> CopyrightGuard:
        salt = b"0123456789abcdef"
        pw_hash = hashlib.pbkdf2_hmac("sha256", test_password.encode("utf-8"), salt, 10_000).hex()
        return CopyrightGuard(
            project_root=project_root,
            salt_hex=salt.hex(),
            password_hash_hex=pw_hash,
            iterations=10_000,
        )

    def _write_valid_frontend_files(self, root: str) -> None:
        comp_dir = os.path.join(root, "frontend", "src", "components")
        src_dir = os.path.join(root, "frontend", "src")
        os.makedirs(comp_dir, exist_ok=True)
        with open(os.path.join(comp_dir, "Footer.tsx"), "w", encoding="utf-8") as fh:
            fh.write('export function Footer() { return <p>© 2026 zhafx.corp</p>; }\n')
        with open(os.path.join(src_dir, "App.tsx"), "w", encoding="utf-8") as fh:
            fh.write("export default function App() { return <Footer />; }\n")

    def test_rules_digest_matches_expected(self) -> None:
        guard = CopyrightGuard()
        info = guard.get_info()
        self.assertEqual(info["owner"], COPYRIGHT_OWNER)
        self.assertEqual(info["notice"], COPYRIGHT_NOTICE)
        self.assertTrue(info["locked"])
        self.assertTrue(info["passwordProtected"])
        self.assertFalse(info["deletable"])
        self.assertTrue(info["integrity"]["valid"])
        self.assertEqual(info["integrity"]["digest"], compute_rules_digest())

    def test_api_blocks_unauthenticated_delete_and_update(self) -> None:
        client = TestClient(main_app.app)
        res_get = client.get("/api/copyright")
        self.assertEqual(res_get.status_code, 200)
        self.assertEqual(res_get.headers.get("X-Copyright-Owner"), "zhafx.corp")
        self.assertEqual(res_get.json()["owner"], "zhafx.corp")

        res_del = client.delete("/api/copyright")
        self.assertEqual(res_del.status_code, 403)

        res_put = client.put("/api/copyright", json={"customNote": "Hacked"})
        self.assertEqual(res_put.status_code, 403)

        res_bad_pw = client.post("/api/copyright/verify", json={"password": "wrong-password"})
        self.assertEqual(res_bad_pw.status_code, 403)

    def test_authorized_token_cannot_remove_zhafx_owner_or_delete_baseline(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            self._write_valid_frontend_files(tmpdir)
            guard = self._make_test_guard(tmpdir, "demo-pass-123")
            with mock.patch.object(main_app, "copyright_guard", guard):
                client = TestClient(main_app.app)

                verify_res = client.post("/api/copyright/verify", json={"password": "demo-pass-123"})
                self.assertEqual(verify_res.status_code, 200)
                token = verify_res.json()["token"]
                self.assertTrue(verify_res.json()["authorized"])

                # Cannot strip zhafx.corp from notice even with valid token
                bad_notice = client.put(
                    "/api/copyright",
                    headers={"X-Copyright-Token": token},
                    json={"notice": "© 2026 OtherCompany"},
                )
                self.assertEqual(bad_notice.status_code, 400)

                # Valid supplementary note update keeping zhafx.corp
                ok_update = client.put(
                    "/api/copyright",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"customNote": "Lisensi resmi zhafx.corp aktif."},
                )
                self.assertEqual(ok_update.status_code, 200)
                self.assertEqual(ok_update.json()["customNote"], "Lisensi resmi zhafx.corp aktif.")

                # DELETE even with valid token refuses deletion and resets to baseline
                del_res = client.delete(
                    "/api/copyright",
                    headers={"X-Copyright-Token": token},
                )
                self.assertEqual(del_res.status_code, 200)
                self.assertFalse(del_res.json()["deleted"])
                self.assertTrue(del_res.json()["resetToBaseline"])
                self.assertEqual(del_res.json()["copyright"]["notice"], "© 2026 zhafx.corp")

    def test_tampering_with_footer_triggers_http_451(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            self._write_valid_frontend_files(tmpdir)
            guard = self._make_test_guard(tmpdir, "demo-pass-123")
            # Remove zhafx.corp from Footer.tsx
            footer_path = os.path.join(tmpdir, "frontend", "src", "components", "Footer.tsx")
            with open(footer_path, "w", encoding="utf-8") as fh:
                fh.write("export function Footer() { return null; }\n")

            integrity = guard.verify_integrity()
            self.assertFalse(integrity["valid"])

            with mock.patch.object(main_app, "copyright_guard", guard):
                client = TestClient(main_app.app)
                blocked = client.get("/api/account/status")
                self.assertEqual(blocked.status_code, 451)
                self.assertEqual(blocked.json()["code"], "ZHAFX_COPYRIGHT_VIOLATION")

                health = client.get("/api/health")
                self.assertEqual(health.status_code, 200)
                self.assertEqual(health.json()["status"], "copyright_violation")
                self.assertFalse(health.json()["copyrightValid"])

    def test_rate_limit_after_repeated_failed_passwords(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            self._write_valid_frontend_files(tmpdir)
            guard = self._make_test_guard(tmpdir, "demo-pass-123")
            with mock.patch.object(main_app, "copyright_guard", guard):
                client = TestClient(main_app.app)
                for _ in range(5):
                    r = client.post("/api/copyright/verify", json={"password": "bad"})
                    self.assertEqual(r.status_code, 403)
                r6 = client.post("/api/copyright/verify", json={"password": "bad"})
                self.assertEqual(r6.status_code, 429)


if __name__ == "__main__":
    unittest.main()
