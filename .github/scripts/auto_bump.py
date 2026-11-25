#!/usr/bin/env python3
"""Tự nâng số phiên bản add-on để LUÔN BẰNG bản image mới nhất đã phát hành (không bao giờ thấp hơn, không bao giờ lùi).

Supervisor chỉ phát hiện bản mới khi `version` trong config.yaml của add-on đổi, và kéo đúng ảnh có thẻ bằng số đó. Với mỗi add-on:
  - add-on Zalo (image khởi động zalo-calling-loader, CÔNG KHAI): nguồn sự thật là CHÍNH image — liệt kê thẻ ẩn danh trên ghcr.io, lấy số lớn nhất
    mà ảnh đã đủ amd64 + arm64 (thẻ «<số>» cho bản có giao diện, «<số>-noui» cho bản không giao diện). Không cần token, không đọc kho riêng tư,
    nên không thể «kẹt» vì hết hạn token. Phát hành xong, tối đa một chu kỳ cron sau add-on đã bằng image;
  - add-on khác: bản phát hành chính thức mới nhất của kho mã nguồn (như cũ), ảnh phải đủ amd64 + arm64.
Chỉ nâng khi số mới LỚN HƠN số đang có. Đổi version trong config.yaml, dòng «Ghim phiên bản» trong README và thêm mục vào CHANGELOG.md.
Không có gì để nâng thì không đổi tệp nào. ``--dry-run``: chỉ in việc sẽ làm. Chỉ dùng thư viện chuẩn."""
import json
import os
import re
import sys
import urllib.error
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
# add-on -> (kho mã nguồn, hậu tố thẻ ảnh). Bản không giao diện dùng thẻ «<số>-noui». Image của hai add-on Zalo là zalo-calling-loader (công khai).
ADDONS = {"zalo_calling": ("TriTue2011/Zalo-calling", ""), "zalo_calling_noui": ("TriTue2011/Zalo-calling", "-noui"), "zalo_bot": ("TriTue2011/zalo_bot", ""),
          "telegram_calling": ("TriTue2011/Telegram-calling", ""), "tele_rs": ("TriTue2011/tele-rust", "")}
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


REGISTRY_ADDONS = {"zalo_calling", "zalo_calling_noui", "zalo_bot"}          # add-on bám theo thẻ image (công khai) thay vì bản phát hành của kho riêng


def registry_tags(image):
    """Mọi thẻ của image trên ghcr.io (ẩn danh; phân trang theo `last` vì danh sách sắp theo chữ cái, thẻ mới có thể nằm ở trang sau)."""
    path = image.split("ghcr.io/", 1)[1]
    token = http_json("https://ghcr.io/token?scope=repository:%s:pull" % path, {"Accept": "application/json"}).get("token", "")
    tags, last = [], ""
    for _ in range(50):
        url = "https://ghcr.io/v2/%s/tags/list?n=1000%s" % (path, ("&last=" + last) if last else "")
        page = http_json(url, {"Authorization": "Bearer " + token, "Accept": "application/json"}).get("tags") or []
        tags += page
        if len(page) < 1000:
            break
        last = page[-1]
    return tags


def latest_from_registry(image, suffix):
    """Số phiên bản lớn nhất mà image có thẻ «<số><hậu tố>» đủ amd64 + arm64, hoặc None."""
    pat = re.compile(r"^(\d+(?:\.\d+){2,})%s$" % re.escape(suffix))
    cands = sorted({m.group(1) for t in registry_tags(image) for m in [pat.match(t)] if m and version_key(m.group(1))}, key=version_key, reverse=True)
    for ver in cands[:5]:                                           # vài số mới nhất: thẻ vừa đẩy có thể chưa đủ kiến trúc
        if image_ready(image, ver + suffix):
            return ver
    return None


def bump(addon, repo, suffix, dry):
    cfg = read(addon + "/config.yaml")
    cur_full = re.search(r'^version:\s*"([^"]+)"', cfg, re.M).group(1)
    cur = cur_full[:-len(suffix)] if suffix and cur_full.endswith(suffix) else cur_full      # số phát hành, không kèm hậu tố
    image = re.search(r'^image:\s*"([^"]+)"', cfg, re.M).group(1)
    if addon in REGISTRY_ADDONS:
        ver = latest_from_registry(image, suffix)
        if ver is None:
            print("%s: chưa thấy thẻ image nào đủ amd64+arm64 trên %s" % (addon, image))
            return False
        tag, url = "v" + ver, ""
    else:
        rel = latest_release(repo)
        if rel is None:
            print("%s: chưa có bản phát hành chính thức" % addon)
            return False
        tag, ver, url = rel
    if not (version_key(ver) > (version_key(cur) or ())):
        print("%s: đang ở %s, bản mới nhất %s: không có gì để nâng" % (addon, cur, ver))
        return False
    new_full = ver + suffix
    if not image_ready(image, new_full):
        print("%s: có bản %s nhưng ảnh %s:%s chưa đủ amd64+arm64: chờ lần sau" % (addon, ver, image, new_full))
        return False
    print("%s: nâng %s -> %s (%s)" % (addon, cur_full, new_full, tag))
    if dry:
        return True
    write(addon + "/config.yaml", re.sub(r'^(version:\s*)"[^"]+"', r'\g<1>"%s"' % new_full, cfg, count=1, flags=re.M))
    if os.path.exists(os.path.join(ROOT, addon, "README.md")):
        readme = read(addon + "/README.md")
        write(addon + "/README.md", readme.replace("`:%s`" % cur_full, "`:%s`" % new_full))
    log = read(addon + "/CHANGELOG.md") if os.path.exists(os.path.join(ROOT, addon, "CHANGELOG.md")) else "# Nhật ký thay đổi\n\n"
    head = "# Nhật ký thay đổi\n\n"
    if url:
        note = "## %s\n- Tự động nâng theo bản phát hành [%s](%s): xem ghi chú phát hành để biết chi tiết.\n\n" % (new_full, tag, url)
    else:
        note = "## %s\n- Tự động nâng cho bằng image mới nhất đã phát hành (%s).\n\n" % (new_full, tag)
    write(addon + "/CHANGELOG.md", log.replace(head, head + note, 1) if log.startswith(head) else note + log)
    return True


def main():
    dry = "--dry-run" in sys.argv
    changed = False
    for addon, (repo, suffix) in ADDONS.items():
        try:
            changed |= bump(addon, repo, suffix, dry)
        except (urllib.error.URLError, ValueError, KeyError) as err:       # mạng/API lỗi: bỏ qua add-on này, lần sau thử lại
            print("%s: không kiểm được (%s)" % (addon, err))
    print("CÓ THAY ĐỔI" if changed else "không thay đổi")


if __name__ == "__main__":
    main()
