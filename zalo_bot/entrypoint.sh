#!/bin/sh

# Cài đặt jq nếu chưa có
if ! command -v jq >/dev/null 2>&1; then
  echo "Installing jq..."
  apt-get update && apt-get install -y jq
fi

# Kiểm tra và tạo thư mục dữ liệu
if [ -n "$DATA_DIRECTORY" ]; then
  echo "Using custom data directory from environment: $DATA_DIRECTORY"
  mkdir -p "$DATA_DIRECTORY"
  mkdir -p "$DATA_DIRECTORY/cookies"
else
  echo "No DATA_DIRECTORY set in environment"
fi

# Kiểm tra xem đang chạy trong Home Assistant
if [ -f /data/options.json ]; then
  echo "Running in Home Assistant environment"
  echo "Home Assistant directories: /config (config:rw), /data (data:rw), /share (share:rw)"
  
  # Trích xuất thư mục dữ liệu từ options.json nếu không được đặt từ biến môi trường
  if [ -z "$DATA_DIRECTORY" ]; then
    DATA_DIRECTORY=$(jq -r '.data_directory // "/config/zalo_bot"' /data/options.json)
    export DATA_DIRECTORY
    echo "Extracted data directory from options.json: $DATA_DIRECTORY"
    
    # Kiểm tra xem thư mục gốc tồn tại không
    DATA_PARENT=$(dirname "$DATA_DIRECTORY")
    if [ -d "$DATA_PARENT" ] && [ -w "$DATA_PARENT" ]; then
      echo "Parent directory $DATA_PARENT exists and is writable"
      mkdir -p "$DATA_DIRECTORY"
    else
      echo "WARNING: Parent directory $DATA_PARENT doesn't exist or is not writable"
      echo "Will try to use the directory anyway, but may have limited functionality"
    fi
  fi

  # Bí mật đặt qua giao diện add-on. Bản này KHÔNG còn mật khẩu admin 'admin' và
  # KHÔNG còn khoá phiên cố định: thiếu thì server tự sinh ngẫu nhiên — mật khẩu
  # in ra log lần đầu, còn khoá phiên đổi mỗi lần khởi động lại nên ai đang đăng
  # nhập sẽ bị đá ra. Đặt các giá trị dưới đây để tránh cả hai.
  if [ -z "$SESSION_SECRET" ]; then
    SESSION_SECRET=$(jq -r '.session_secret // ""' /data/options.json)
    export SESSION_SECRET
  fi
  if [ -z "$ZALO_SERVER_ADMIN_PASSWORD" ]; then
    ZALO_SERVER_ADMIN_PASSWORD=$(jq -r '.admin_password // ""' /data/options.json)
    export ZALO_SERVER_ADMIN_PASSWORD
  fi
  # Chưa đặt api_key thì các API Zalo (/api/sendmessage, /api/findUser…) vẫn mở
  # cho MỌI máy trong LAN, vì add-on chạy host_network. Đặt vào là đóng lại.
  if [ -z "$ZALO_SERVER_API_KEY" ]; then
    ZALO_SERVER_API_KEY=$(jq -r '.api_key // ""' /data/options.json)
    export ZALO_SERVER_API_KEY
  fi
fi

# Nếu vẫn không có DATA_DIRECTORY, sử dụng mặc định
if [ -z "$DATA_DIRECTORY" ]; then
  export DATA_DIRECTORY="/app/data"
  echo "Using default data directory: $DATA_DIRECTORY"
  mkdir -p "$DATA_DIRECTORY"
  mkdir -p "$DATA_DIRECTORY/cookies"
fi

# Kiểm tra xem các thư mục cần thiết đã tồn tại chưa, nếu không thì tạo một cách nhẹ nhàng
if [ ! -d "$DATA_DIRECTORY/cookies" ]; then
  echo "Creating cookies directory (if needed)"
  mkdir -p "$DATA_DIRECTORY/cookies"
fi

if [ ! -d "$DATA_DIRECTORY/logs" ]; then
  echo "Creating logs directory (if needed)"
  mkdir -p "$DATA_DIRECTORY/logs"
fi

# Kiểm tra file webhook-config.json mặc định 
WEBHOOK_CONFIG_FILE="$DATA_DIRECTORY/webhook-config.json"
if [ ! -f "$WEBHOOK_CONFIG_FILE" ]; then
  echo "Creating default webhook-config.json..."
  # Kiểm tra quyền ghi trước khi tạo file
  if [ -w "$DATA_DIRECTORY" ]; then
    cat > "$WEBHOOK_CONFIG_FILE" << EOF
{
  "default": {
    "messageWebhookUrl": "${MESSAGE_WEBHOOK_URL:-}",
    "groupEventWebhookUrl": "${GROUP_EVENT_WEBHOOK_URL:-}",
    "reactionWebhookUrl": "${REACTION_WEBHOOK_URL:-}"
  },
  "accounts": {}
}
EOF
    echo "Created default webhook-config.json at $WEBHOOK_CONFIG_FILE"
  else
    echo "WARNING: Cannot create webhook-config.json (directory not writable)"
  fi
else
  echo "Found existing webhook-config.json at $WEBHOOK_CONFIG_FILE"
fi

# Kiểm tra file proxies.json mặc định
PROXIES_FILE="$DATA_DIRECTORY/proxies.json"
if [ ! -f "$PROXIES_FILE" ]; then
  echo "Creating default proxies.json..."
  # Kiểm tra quyền ghi trước khi tạo file
  if [ -w "$DATA_DIRECTORY" ]; then
    echo "[]" > "$PROXIES_FILE"
    echo "Created default proxies.json at $PROXIES_FILE"
  else
    echo "WARNING: Cannot create proxies.json (directory not writable)"
  fi
else
  echo "Found existing proxies.json at $PROXIES_FILE"
fi

# Kiểm tra quyền truy cập vào thư mục dữ liệu mà không thay đổi quyền
echo "Checking access to data directory: $DATA_DIRECTORY"

# Hiển thị nội dung thư mục dữ liệu để gỡ lỗi
echo "Contents of data directory:"
ls -la "$DATA_DIRECTORY"

# Kiểm tra quyền ghi mà không tạo file thực tế
if [ -w "$DATA_DIRECTORY" ]; then
  echo "Write permission check: OK - Directory is writable"
else
  echo "Write permission check: WARNING - Directory may not be writable"
  echo "Application may have limited functionality but will try to continue"
fi

if [ -d "$DATA_DIRECTORY/cookies" ]; then
  echo "Contents of cookies directory:"
  ls -la "$DATA_DIRECTORY/cookies"
fi

# Hiển thị các biến môi trường quan trọng
echo "Environmental variables:"
echo "DATA_DIRECTORY=$DATA_DIRECTORY"
echo "NODE_ENV=$NODE_ENV"
echo "PORT=$PORT"
echo "MESSAGE_WEBHOOK_URL=${MESSAGE_WEBHOOK_URL:-not set}"
echo "-------------------------------------"

# Đảm bảo DATA_DIRECTORY được truyền vào Node.js
export DATA_DIRECTORY="$DATA_DIRECTORY"

# Chưa khai session_secret ở cấu hình lẫn biến môi trường thì sinh MỘT LẦN rồi
# giữ lại trong thư mục dữ liệu. Sinh mới mỗi lần chạy sẽ đá mọi người đang đăng
# nhập ra sau mỗi lần khởi động lại add-on.
if [ -z "$SESSION_SECRET" ]; then
  SECRET_FILE="$DATA_DIRECTORY/.session_secret"
  if [ ! -s "$SECRET_FILE" ] && [ -w "$DATA_DIRECTORY" ]; then
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" \
      > "$SECRET_FILE" 2>/dev/null
    chmod 600 "$SECRET_FILE" 2>/dev/null
  fi
  if [ -s "$SECRET_FILE" ]; then
    SESSION_SECRET=$(cat "$SECRET_FILE")
    export SESSION_SECRET
    echo "Dùng SESSION_SECRET đã lưu tại $SECRET_FILE (phiên sống qua restart)"
  fi
fi

# Mật khẩu admin: chưa khai thì sinh MỘT LẦN rồi giữ lại, thay vì để server tự
# sinh mới mỗi lần tạo users.json. Sinh ở đây để còn ghi ra tệp cho người cài
# đọc được — bắt họ lục log mới biết đăng nhập bằng gì là không xong.
if [ -z "$ZALO_SERVER_ADMIN_PASSWORD" ]; then
  PASS_FILE="$DATA_DIRECTORY/.admin_password"
  if [ ! -s "$PASS_FILE" ] && [ -w "$DATA_DIRECTORY" ]; then
    node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))" \
      > "$PASS_FILE" 2>/dev/null
    chmod 600 "$PASS_FILE" 2>/dev/null
  fi
  if [ -s "$PASS_FILE" ]; then
    ZALO_SERVER_ADMIN_PASSWORD=$(cat "$PASS_FILE")
    export ZALO_SERVER_ADMIN_PASSWORD
  fi
fi

# Khoá API: chưa khai thì cũng TỰ SINH. Trước đây để trống nghĩa là các API gửi
# tin mở cho mọi máy trong mạng nội bộ, và cách khắc phục duy nhất ghi trong tài
# liệu là bảo người dùng tự chạy `openssl rand -hex 32` — đòi hỏi vô lý với
# người cài add-on qua giao diện. Tự sinh vừa bỏ được rào cản đó, vừa đổi mặc
# định từ MỞ thành ĐÓNG.
if [ -z "$ZALO_SERVER_API_KEY" ]; then
  KEY_FILE="$DATA_DIRECTORY/.api_key"
  if [ ! -s "$KEY_FILE" ] && [ -w "$DATA_DIRECTORY" ]; then
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" \
      > "$KEY_FILE" 2>/dev/null
    chmod 600 "$KEY_FILE" 2>/dev/null
  fi
  if [ -s "$KEY_FILE" ]; then
    ZALO_SERVER_API_KEY=$(cat "$KEY_FILE")
    export ZALO_SERVER_API_KEY
  fi
fi

# Tệp thông tin đăng nhập, đặt ngay trong thư mục dữ liệu để mở bằng File editor
# hay Samba là thấy. Chỉ ghi khi CHÍNH add-on sinh mật khẩu; anh tự khai mật
# khẩu ở phần cài đặt thì không ghi gì cả.
INFO_FILE="$DATA_DIRECTORY/THONG-TIN-DANG-NHAP.txt"
if { [ -s "$DATA_DIRECTORY/.admin_password" ] || [ -s "$DATA_DIRECTORY/.api_key" ]; } \
   && [ -w "$DATA_DIRECTORY" ]; then
  {
    echo "THONG TIN DANG NHAP ZALO BOT"
    echo "============================"
    echo
    echo "Dia chi : http://<dia-chi-may-Home-Assistant>:${PORT:-3000}"
    echo "Tai khoan: ${ZALO_SERVER_ADMIN_USERNAME:-admin}"
    echo "Mat khau : $ZALO_SERVER_ADMIN_PASSWORD"
    echo
    echo "Mat khau nay do add-on tu sinh vi phan cai dat de trong."
    echo "Dang nhap xong nen doi mat khau, hoac dien san o 'admin_password'."
    echo
    echo "LUU Y: neu da doi mat khau trong giao dien thi tep nay KHONG con dung."
    echo
    echo "----------------------------------------------------------"
    echo "KHOA API (cho REST command / script goi thang vao API gui tin):"
    echo "$ZALO_SERVER_API_KEY"
    echo
    echo "Dung dang header:  Authorization: Bearer <khoa tren>"
    echo "Tich hop HACS KHONG can khoa nay - no dang nhap bang tai khoan."
  } > "$INFO_FILE" 2>/dev/null
  chmod 600 "$INFO_FILE" 2>/dev/null
  echo "============================================================"
  echo " Tai khoan: ${ZALO_SERVER_ADMIN_USERNAME:-admin}"
  echo " Mat khau : $ZALO_SERVER_ADMIN_PASSWORD"
  echo " Khoa API : $ZALO_SERVER_API_KEY"
  echo " Da ghi ra: $INFO_FILE"
  echo "============================================================"
fi

# Khởi động ứng dụng
echo "Starting Zalo Server with data directory: $DATA_DIRECTORY"
exec node server.js
