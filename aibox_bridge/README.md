# AI BOX WebSocket Bridge - HA Add-on

## Cai dat (Local Add-on)

### Buoc 1: Copy addon vao HAOS

**Cach 1 - Samba / SSH:**
```bash
# Copy folder aibox_bridge vao /addons/
scp -r aibox_bridge root@homeassistant.local:/addons/
```

**Cach 2 - File Editor add-on:**
1. Cai add-on "File Editor" tu Add-on Store
2. Mo File Editor, navigate to `/addons/`
3. Tao folder `aibox_bridge`
4. Upload tat ca file vao

**Cach 3 - SSH & Web Terminal:**
```bash
mkdir -p /addons/aibox_bridge
cd /addons/aibox_bridge
# Copy tung file vao day
```

### Buoc 2: Cai dat add-on

1. Vao **Settings** > **Add-ons** > **Add-on Store**
2. Click menu 3 cham (goc tren phai) > **Check for updates**
3. Sau khi refresh, cuon xuong **Local add-ons**
4. Click **AI BOX WebSocket Bridge**
5. Click **Install**
6. Doi build xong (~1-2 phut)

### Buoc 3: Cau hinh

1. Vao tab **Configuration** cua add-on
2. Them IP cac loa vao `allowed_ips`:
   ```yaml
   allowed_ips:
     - "172.16.10.17"
     - "172.16.10.16"
   ```
3. Click **Save**
4. Vao tab **Info** > Click **Start**

### Buoc 4: Cau hinh Cloudflare Tunnel

Trong Cloudflare Dashboard, tao 2 Public Hostnames:

| Hostname             | Service                    |
|----------------------|----------------------------|
| aibox.domain.com     | http://localhost:18082      |
| spk.domain.com       | http://localhost:18080      |

### Buoc 5: Cau hinh Card

```yaml
type: custom:aibox-webui-card
tunnel_host: aibox.domain.com
speaker_tunnel_host: spk.domain.com
rooms:
  - name: "Phong khach"
    host: "172.16.10.17"
  - name: "Phong ngu"
    host: "172.16.10.16"
```

## File structure

```
/addons/aibox_bridge/
  config.yaml        # HA add-on manifest
  Dockerfile          # Build instructions
  build.yaml          # Multi-arch build config
  bridge.py           # WebSocket bridge logic
  run.sh              # Entrypoint script
  icon.png            # Add-on icon
  logo.png            # Add-on logo
  DOCS.md             # Documentation tab
  CHANGELOG.md        # Version history
  translations/
    en.json           # English config labels
```
