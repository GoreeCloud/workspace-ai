#!/usr/bin/env python3
"""Read-only candidate image preflight for the protected Workspace AI Compose stack.

This tool never prints Docker Compose configuration, environment values,
secret contents or host paths. A failure never modifies any container.
"""
import argparse
import copy
import json
import re
import subprocess
import sys


def require(ok, message):
    if not ok:
        raise ValueError(message)


def check_image_only(before, after, baseline_tag, candidate_tag):
    require(isinstance(before, dict) and isinstance(after, dict),
            "Effective Compose documents must be objects")
    previous = before.get("services", {}).get("workspace-ai")
    proposed = after.get("services", {}).get("workspace-ai")
    require(isinstance(previous, dict) and isinstance(proposed, dict),
            "Workspace AI service is missing")
    require(isinstance(baseline_tag, str) and isinstance(candidate_tag, str)
            and baseline_tag.strip() and candidate_tag.strip()
            and baseline_tag != candidate_tag, "Expected two distinct image tags")
    require(previous.get("image") == baseline_tag, "Wrong baseline image tag")
    require(proposed.get("image") == candidate_tag, "Wrong candidate image tag")
    original = copy.deepcopy(before)
    staged = copy.deepcopy(after)
    del original["services"]["workspace-ai"]["image"]
    del staged["services"]["workspace-ai"]["image"]
    require(original == staged, "STOP: change affects more than the image")
    require(proposed.get("read_only") is True, "STOP: writable root filesystem")
    require("ALL" in proposed.get("cap_drop", []),
            "STOP: Linux capabilities not dropped")
    require(not proposed.get("privileged", False), "STOP: privileged service")
    require(not proposed.get("ports"), "STOP: host ports published")
    require("no-new-privileges:true" in proposed.get("security_opt", []),
            "STOP: no-new-privileges missing")
    require(proposed.get("restart") == "unless-stopped",
            "STOP: wrong restart policy")
    require(proposed.get("user") == "1000:1000", "STOP: runtime user changed")
    networks = proposed.get("networks", {})
    require(set(networks) == {"private_smoke", "private_ingress"},
            "STOP: unexpected Docker networks")
    require(after.get("networks", {}).get("private_smoke", {}).get("internal") is True,
            "STOP: smoke network is not internal")
    require(after.get("networks", {}).get("private_ingress", {}).get("external") is True,
            "STOP: ingress network is not external")
    require(any(isinstance(v, dict) and
                v.get("target") == "/run/secrets/workspace-ai-gateway.token"
                for v in proposed.get("volumes", [])),
            "STOP: expected gateway mount target is absent")
    return True


def run(*args):
    response = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              text=True, timeout=30, check=True)
    return response.stdout.strip()


def compose_json(project, paths, extra=None):
    args = ["docker", "compose", "-p", project]
    for path in paths:
        args += ["-f", path]
    if extra:
        args += ["-f", extra]
    return json.loads(run(*args, "config", "--format", "json"))


def verify_live(project, paths, baseline_tag, candidate_tag):
    args = ["docker", "compose", "-p", project]
    for path in paths:
        args += ["-f", path]
    cid = run(*args, "ps", "-q", "workspace-ai")
    require(bool(cid) and "\n" not in cid, "STOP: live container not uniquely found")
    baseline_id = run("docker", "image", "inspect", baseline_tag, "--format", "{{.Id}}")
    candidate_id = run("docker", "image", "inspect", candidate_tag, "--format", "{{.Id}}")
    details = run("docker", "inspect", cid, "--format",
                  "{{.Image}}|{{.State.Status}}|{{.State.Health.Status}}|"
                  "{{json .HostConfig.PortBindings}}").split("|")
    require(len(details) == 4 and details[0] == baseline_id,
            "STOP: actual live image is not the expected rollback image")
    require(details[1:3] == ["running", "healthy"], "STOP: live baseline unhealthy")
    require(details[3] == "{}", "STOP: live backend publishes ports")
    require(candidate_id != baseline_id, "STOP: candidate and baseline have same image ID")
    return baseline_id, candidate_id


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--file", action="append", required=True)
    parser.add_argument("--override", required=True)
    parser.add_argument("--baseline-image", required=True)
    parser.add_argument("--candidate-image", required=True)
    cfg = parser.parse_args(argv)
    require(re.fullmatch(r"[a-z0-9][a-z0-9_-]{2,90}", cfg.project),
            "STOP: invalid Compose project")
    check_image_only(compose_json(cfg.project, cfg.file),
                     compose_json(cfg.project, cfg.file, cfg.override),
                     cfg.baseline_image, cfg.candidate_image)
    old_id, new_id = verify_live(cfg.project, cfg.file, cfg.baseline_image,
                                 cfg.candidate_image)
    print("PASS: candidate changes only the application image in resolved Compose")
    print("PASS: read-only root, gateway mount, ports and private networking retained")
    print("PASS: healthy live image matches the preserved rollback image")
    print("BASELINE_IMAGE_ID=" + old_id)
    print("CANDIDATE_IMAGE_ID=" + new_id)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        # Never echo resolved configuration, environment, passwords or stderr.
        print("FAIL: private-development image preflight did not pass; no changes made",
              file=sys.stderr)
        raise SystemExit(1)
