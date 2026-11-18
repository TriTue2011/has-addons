#!/usr/bin/env python3
"""Kiểm auto_bump.py (không cần mạng): add-on Zalo LUÔN bằng thẻ image mới nhất đủ amd64+arm64, không lùi, không nâng khi ảnh chưa đủ kiến trúc,
đọc đủ các trang thẻ. Chạy: python3 .github/scripts/test_auto_bump.py"""
import importlib.util
import os
import shutil
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("auto_bump", os.path.join(HERE, "auto_bump.py"))
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
IMG = "ghcr.io/tritue2011/zalo-calling-loader"


def fake(tags, ready):
    """http_json giả: danh sách thẻ (phân trang theo n/last) và manifest (đủ kiến trúc nếu thẻ nằm trong `ready`)."""
    def http_json(url, headers=None):
        if "/token" in url:
            return {"token": "anon"}
        if "/tags/list" in url:
            n = int(url.split("n=")[1].split("&")[0])
            last = url.split("last=")[1] if "last=" in url else ""
            ts = sorted(tags)
            ts = [t for t in ts if t > last] if last else ts
            return {"tags": ts[:n]}
        tag = url.rsplit("/manifests/", 1)[1]
        return {"manifests": [{"platform": {"architecture": a}} for a in (("amd64", "arm64") if tag in ready else ("amd64",))]}
    return http_json


def sandbox(version_ui, version_noui):
    d = tempfile.mkdtemp(prefix="ab-")
    for addon, ver in (("zalo_calling", version_ui), ("zalo_calling_noui", version_noui)):
        os.makedirs(os.path.join(d, addon))
        open(os.path.join(d, addon, "config.yaml"), "w", encoding="utf-8").write('name: "x"\nversion: "%s"\nimage: "%s"\n' % (ver, IMG))
        open(os.path.join(d, addon, "README.md"), "w", encoding="utf-8").write("Ghim `:%s`\n" % ver)
        open(os.path.join(d, addon, "CHANGELOG.md"), "w", encoding="utf-8").write("# Nhật ký thay đổi\n\n## %s\n- cũ\n" % ver)
    B.ROOT = d
    return d


def version_of(d, addon):
    import re
    return re.search(r'^version: "([^"]+)"', open(os.path.join(d, addon, "config.yaml"), encoding="utf-8").read(), re.M).group(1)


def test_both_addons_follow_the_newest_ready_image_tag():
    d = sandbox("2026.11.16.3", "2026.11.16.3-noui")
    tags = ["2026.11.16.3", "2026.11.16.3-noui", "v2026.11.18.6", "2026.11.18.6", "2026.11.18.6-noui", "v2026.11.18.6-noui", "latest", "noui"]
    B.http_json = fake(tags, set(tags))
    for addon, (repo, suffix) in B.ADDONS.items():
        if addon in B.REGISTRY_ADDONS:
            B.bump(addon, repo, suffix, False)
    assert version_of(d, "zalo_calling") == "2026.11.18.6" and version_of(d, "zalo_calling_noui") == "2026.11.18.6-noui"
    assert "## 2026.11.18.6" in open(os.path.join(d, "zalo_calling", "CHANGELOG.md"), encoding="utf-8").read()
    shutil.rmtree(d)


def test_never_downgrades_and_waits_for_both_architectures():
    d = sandbox("2026.11.20.1", "2026.11.20.1-noui")
    B.http_json = fake(["2026.11.18.6", "2026.11.18.6-noui"], {"2026.11.18.6", "2026.11.18.6-noui"})
    assert B.bump("zalo_calling", "x", "", False) is False and version_of(d, "zalo_calling") == "2026.11.20.1"       # image cũ hơn: không lùi
    d2 = sandbox("2026.11.16.3", "2026.11.16.3-noui")
    B.http_json = fake(["2026.11.16.3", "2026.11.18.6", "2026.11.18.7"], {"2026.11.18.6"})                            # .7 chưa đủ kiến trúc → dừng ở .6
    B.bump("zalo_calling", "x", "", False)
    assert version_of(d2, "zalo_calling") == "2026.11.18.6"
    shutil.rmtree(d); shutil.rmtree(d2)


def test_zalo_bot_addon_follows_the_loader_image_and_tolerates_missing_docs():
    d = tempfile.mkdtemp(prefix="ab-")
    os.makedirs(os.path.join(d, "zalo_bot"))
    open(os.path.join(d, "zalo_bot", "config.yaml"), "w", encoding="utf-8").write('name: "x"\nversion: "2026.9.25.0"\nimage: "ghcr.io/tritue2011/zalobot-loader"\n')   # không README/CHANGELOG
    B.ROOT = d
    assert "zalo_bot" in B.ADDONS and "zalo_bot" in B.REGISTRY_ADDONS
    B.http_json = fake(["2026.9.25.0", "2026.11.19.1", "v2026.11.19.1", "latest"], {"2026.9.25.0", "2026.11.19.1"})
    repo, suffix = B.ADDONS["zalo_bot"]
    assert B.bump("zalo_bot", repo, suffix, False) is True and version_of(d, "zalo_bot") == "2026.11.19.1"
    assert "2026.11.19.1" in open(os.path.join(d, "zalo_bot", "CHANGELOG.md"), encoding="utf-8").read()
    shutil.rmtree(d)


def test_reads_every_page_of_tags_because_the_list_is_alphabetical():
    d = sandbox("2026.11.16.3", "2026.11.16.3-noui")
    old = ["2026.%02d.%02d.%d" % (m, dd, i) for m in range(1, 10) for dd in range(1, 28) for i in range(1, 6)]          # >1000 thẻ cũ xếp trước theo chữ cái
    tags = old + ["2026.11.18.6"]
    assert len(tags) > 1000
    B.http_json = fake(tags, {"2026.11.18.6"})
    B.bump("zalo_calling", "x", "", False)
    assert version_of(d, "zalo_calling") == "2026.11.18.6", version_of(d, "zalo_calling")
    shutil.rmtree(d)


if __name__ == "__main__":
    for n, f in list(globals().items()):
        if n.startswith("test_") and callable(f):
            f()
            print("PASS", n)
    print("ALL AUTO-BUMP TESTS PASSED")
