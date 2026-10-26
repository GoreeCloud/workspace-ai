"""Synthetic regression tests for the read-only private-development release gate."""
import copy
import importlib.util
from pathlib import Path
import subprocess
import sys
import unittest

script = Path(__file__).resolve().parents[1] / "scripts" / "private-dev-image-preflight.py"
spec = importlib.util.spec_from_file_location("private_dev_image_preflight", script)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
check = module.check_image_only
OLD = "goreecloud-workspace-ai-private-dev:acceptance-fixture"
NEW = "goreecloud-workspace-ai-private-dev:candidate-fixture"


def baseline():
    return {
        "name": "goreecloud-workspace-ai-private-dev",
        "services": {"workspace-ai": {
            "image": OLD, "read_only": True, "user": "1000:1000",
            "cap_drop": ["ALL"], "privileged": False, "ports": [],
            "restart": "unless-stopped",
            "security_opt": ["no-new-privileges:true"],
            "networks": {"private_smoke": None, "private_ingress": {"aliases": ["app"]}},
            "volumes": [{"type": "bind", "source": "/fake/token.fixture",
                         "target": "/run/secrets/workspace-ai-gateway.token",
                         "read_only": True}],
            "environment": {"NODE_ENV": "production"}}},
        "networks": {"private_smoke": {"internal": True},
                     "private_ingress": {"external": True}}}


def candidate():
    cfg = baseline()
    cfg["services"]["workspace-ai"]["image"] = NEW
    return cfg


class PrivateImagePreflightTests(unittest.TestCase):
    def test_only_image_change_passes_and_does_not_mutate_inputs(self):
        old, new = baseline(), candidate()
        old_copy, new_copy = copy.deepcopy(old), copy.deepcopy(new)
        self.assertTrue(check(old, new, OLD, NEW))
        self.assertEqual(old, old_copy)
        self.assertEqual(new, new_copy)

    def test_wrong_or_equal_images_refused(self):
        with self.assertRaises(ValueError):
            check(baseline(), candidate(), OLD, OLD)
        wrong = candidate()
        wrong["services"]["workspace-ai"]["image"] = "malicious:image"
        with self.assertRaises(ValueError):
            check(baseline(), wrong, OLD, NEW)

    def test_unexpected_configuration_change_fails_closed(self):
        edits = [
            lambda x: x["services"]["workspace-ai"].update(ports=[{"published": 3031}]),
            lambda x: x["services"]["workspace-ai"].update(privileged=True),
            lambda x: x["services"]["workspace-ai"].update(read_only=False),
            lambda x: x["services"]["workspace-ai"].update(cap_drop=[]),
            lambda x: x["services"]["workspace-ai"].update(user="0:0"),
            lambda x: x["services"]["workspace-ai"].update(security_opt=[]),
            lambda x: x["services"]["workspace-ai"].update(restart="always"),
            lambda x: x["services"]["workspace-ai"]["environment"].update(API_KEY="synthetic"),
            lambda x: x["services"]["workspace-ai"]["networks"].update(public=None),
            lambda x: x["networks"]["private_smoke"].update(internal=False),
            lambda x: x["networks"]["private_ingress"].update(external=False),
            lambda x: x["services"]["workspace-ai"].update(volumes=[]),
            lambda x: x["services"]["workspace-ai"]["volumes"][0].update(source="/other"),
            lambda x: x["services"].update(other={"image": "unknown"}),
            lambda x: x["services"]["workspace-ai"].update(healthcheck={"test": ["CMD", "true"]})
        ]
        for edit in edits:
            with self.subTest(edit=str(edit)):
                new = candidate()
                edit(new)
                with self.assertRaisesRegex(ValueError, "STOP"):
                    check(baseline(), new, OLD, NEW)

    def test_unsafe_unchanged_settings_are_still_refused(self):
        edits = [
            lambda x: x["services"]["workspace-ai"].update(read_only=False),
            lambda x: x["services"]["workspace-ai"].update(ports=[{"published": 3031}]),
            lambda x: x["services"]["workspace-ai"].update(cap_drop=[]),
            lambda x: x["services"]["workspace-ai"].update(security_opt=[]),
            lambda x: x["services"]["workspace-ai"].update(privileged=True),
            lambda x: x["services"]["workspace-ai"].update(volumes=[]),
            lambda x: x["networks"]["private_smoke"].update(internal=False),
            lambda x: x["networks"]["private_ingress"].update(external=False)
        ]
        for edit in edits:
            with self.subTest(edit=str(edit)):
                old = baseline()
                edit(old)
                new = copy.deepcopy(old)
                new["services"]["workspace-ai"]["image"] = NEW
                with self.assertRaisesRegex(ValueError, "STOP"):
                    check(old, new, OLD, NEW)

    def test_cli_errors_do_not_echo_inputs(self):
        result = subprocess.run(
            [sys.executable, str(script), "--baseline-image", "SECRET_SYNTHETIC"],
            capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("SECRET_SYNTHETIC", result.stderr)


if __name__ == "__main__":
    unittest.main()
