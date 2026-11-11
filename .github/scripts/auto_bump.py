#!/usr/bin/env python3
"""Tự nâng số phiên bản add-on theo bản phát hành mới của kho mã nguồn, để Home Assistant Supervisor thấy có bản mới (và tự cập nhật nếu bật).

Supervisor chỉ phát hiện bản mới khi `version` trong config.yaml của add-on đổi, và kéo đúng ảnh có thẻ bằng số đó. Với mỗi add-on:
  1. lấy bản phát hành chính thức (không nháp, không prerelease) mới nhất của kho mã nguồn;
  2. chỉ nâng khi số đó LỚN HƠN số đang có (không bao giờ lùi) và ảnh ghcr.io/<image>:<số> đã có đủ amd64 + arm64 (công khai);
  3. đổi version trong config.yaml, dòng «Ghim phiên bản» trong README và thêm mục vào CHANGELOG.md (kèm liên kết ghi chú phát hành).
Không có gì để nâng thì không đổi tệp nào. ``--dry-run``: chỉ in việc sẽ làm. Chỉ dùng thư viện chuẩn."""
import json
import os
import re
import sys
import urllib.error
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ADDONS = {"zalo_calling": "TriTue2011/Zalo-calling", "telegram_calling": "TriTue2011/Telegram-calling"}
NEED_ARCH = {"amd64", "arm64"}
TIMEOUT = 20


def http_json(url, headers=None):
    h = {"Accept": "application/vnd.github+json", "User-Agent": "has-addons-auto-bump"}
    tok = os.environ.get("GITHUB_TOKEN")
    if tok and "api.github.com" in url:
        h["Authorization"] = "Bearer " + tok
    h.update(headers or {})
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=TIMEOUT) as r:
        return json.loads(r.read())


def version_key(v):
    try:
        return tuple(int(p) for p in v.split("."))
    except ValueError:
        return None


def latest_release(repo):
    """(tag, số phiên bản, url ghi chú) của bản phát hành chính thức mới nhất, hoặc None."""
    for rel in http_json("https://api.github.com/repos/%s/releases?per_page=10" % repo):
        if rel.get("draft") or rel.get("prerelease"):
            continue
        tag = rel["tag_name"]
        ver = tag[1:] if tag[:1] in ("v", "V") else tag
        if version_key(ver):
            return tag, ver, rel.get("html_url", "")
    return None


def image_ready(image, tag):
    """Ảnh có thẻ ``tag`` (không chữ v) đã có đủ amd64 + arm64, kéo ẩn danh được."""
    path = image.split("ghcr.io/", 1)[1]
    try:
        token = http_json("https://ghcr.io/token?scope=repository:%s:pull" % path, {"Accept": "application/json"}).get("token", "")
        idx = http_json("https://ghcr.io/v2/%s/manifests/%s" % (path, tag), {
            "Authorization": "Bearer " + token,
            "Accept": "application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json"})
    except (urllib.error.URLError, ValueError, KeyError):
        return False
    archs = {m.get("platform", {}).get("architecture") for m in idx.get("manifests", [])}
    return NEED_ARCH <= archs


def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as fh:
        return fh.read()


def write(p, s):
    with open(os.path.join(ROOT, p), "w", encoding="utf-8") as fh:
        fh.write(s)


def bump(addon, repo, dry):
    cfg = read(addon + "/config.yaml")
    cur = re.search(r'^version:\s*"([^"]+)"', cfg, re.M).group(1)
    image = re.search(r'^image:\s*"([^"]+)"', cfg, re.M).group(1)
    rel = latest_release(repo)
    if rel is None:
        print("%s: chưa có bản phát hành chính thức" % addon)
        return False
    tag, ver, url = rel
    if not (version_key(ver) > (version_key(cur) or ())):
        print("%s: đang ở %s, bản mới nhất %s: không có gì để nâng" % (addon, cur, ver))
        return False
    if not image_ready(image, ver):
        print("%s: có bản %s nhưng ảnh %s:%s chưa đủ amd64+arm64: chờ lần sau" % (addon, ver, image, ver))
        return False
    print("%s: nâng %s -> %s (%s)" % (addon, cur, ver, tag))
    if dry:
        return True
    write(addon + "/config.yaml", re.sub(r'^(version:\s*)"[^"]+"', r'\g<1>"%s"' % ver, cfg, count=1, flags=re.M))
    readme = read(addon + "/README.md")
    write(addon + "/README.md", readme.replace("`:%s`" % cur, "`:%s`" % ver))
    log = read(addon + "/CHANGELOG.md")
    head = "# Nhật ký thay đổi\n\n"
    note = "## %s\n- Tự động nâng theo bản phát hành [%s](%s): xem ghi chú phát hành để biết chi tiết.\n\n" % (ver, tag, url)
    write(addon + "/CHANGELOG.md", log.replace(head, head + note, 1) if log.startswith(head) else note + log)
    return True


def main():
    dry = "--dry-run" in sys.argv
    changed = False
    for addon, repo in ADDONS.items():
        try:
            changed |= bump(addon, repo, dry)
        except (urllib.error.URLError, ValueError, KeyError) as err:       # mạng/API lỗi: bỏ qua add-on này, lần sau thử lại
            print("%s: không kiểm được (%s)" % (addon, err))
    print("CÓ THAY ĐỔI" if changed else "không thay đổi")


if __name__ == "__main__":
    main()
