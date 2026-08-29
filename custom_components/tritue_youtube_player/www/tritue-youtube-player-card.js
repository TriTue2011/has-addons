class TriTueYouTubePlayerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._source = "youtube";
    this._selectedPlayers = new Set();
    this._results = [];
    this._currentItem = null;
    this._rendered = false;
    this._defaultsApplied = false;
  }

  setConfig(config) {
    if (!config || typeof config.entity !== "string") {
      throw new Error("TriTue card requires a media_player entity");
    }
    this._config = { title: "TriTue Music", ...config };
    this._restoreNowPlaying();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._rendered) {
      this._render();
      this._bindEvents();
      this._rendered = true;
    }
    this._syncPlayers();
    this._updateSourceButtons();
  }

  getCardSize() {
    return 10;
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          overflow: hidden;
          color: var(--primary-text-color);
          background:
            radial-gradient(circle at 94% 2%, rgba(255, 64, 86, .16), transparent 34%),
            var(--ha-card-background, var(--card-background-color));
        }
        .wrap { padding: 20px; }
        header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
        h2 { margin: 0; font-size: 1.35rem; line-height: 1.2; }
        .subtitle, .hint { color: var(--secondary-text-color); font-size: .86rem; }
        .subtitle { margin: 5px 0 0; }
        .source-switch {
          display: grid;
          grid-template-columns: 1fr 1fr;
          padding: 4px;
          margin: 18px 0 14px;
          border-radius: 12px;
          background: var(--secondary-background-color);
        }
        button, input { font: inherit; }
        button { cursor: pointer; }
        .source-button {
          border: 0;
          border-radius: 9px;
          padding: 9px 12px;
          color: var(--secondary-text-color);
          background: transparent;
          font-weight: 600;
        }
        .source-button[aria-pressed="true"] {
          color: var(--text-primary-color, #fff);
          background: var(--primary-color);
          box-shadow: 0 4px 12px rgba(0, 0, 0, .14);
        }
        form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 9px; }
        input[type="search"] {
          min-width: 0;
          border: 1px solid var(--divider-color);
          border-radius: 11px;
          padding: 11px 13px;
          color: var(--primary-text-color);
          background: var(--secondary-background-color);
          outline: none;
        }
        input[type="search"]:focus { border-color: var(--primary-color); }
        .primary {
          border: 0;
          border-radius: 11px;
          padding: 10px 15px;
          font-weight: 650;
        }
        .primary { color: var(--text-primary-color, #fff); background: var(--primary-color); }
        button:disabled { cursor: not-allowed; opacity: .45; }
        .status { min-height: 21px; margin: 8px 1px 0; color: var(--secondary-text-color); font-size: .84rem; }
        .status.error { color: var(--error-color); }
        .section { margin-top: 18px; }
        .section-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 9px; }
        .section-title h3 { margin: 0; font-size: .95rem; }
        .players { display: flex; flex-wrap: wrap; gap: 8px; max-height: 132px; overflow: auto; }
        .player-chip {
          display: flex;
          align-items: center;
          gap: 7px;
          max-width: 100%;
          padding: 7px 10px;
          border: 1px solid var(--divider-color);
          border-radius: 999px;
          background: var(--secondary-background-color);
          cursor: pointer;
        }
        .player-chip:has(input:checked) { border-color: var(--primary-color); color: var(--primary-color); }
        .player-chip.source-incompatible { opacity: .62; }
        .player-chip input { accent-color: var(--primary-color); }
        .player-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .device-icon { --mdc-icon-size: 17px; color: var(--secondary-text-color); }
        .now-playing {
          display: grid;
          grid-template-columns: 70px minmax(0, 1fr);
          gap: 13px;
          align-items: center;
          padding: 12px;
          border: 1px solid var(--divider-color);
          border-radius: 14px;
          background: color-mix(in srgb, var(--secondary-background-color) 78%, transparent);
        }
        .now-cover {
          display: grid;
          place-items: center;
          width: 70px;
          height: 70px;
          overflow: hidden;
          border-radius: 11px;
          color: var(--secondary-text-color);
          background: var(--divider-color);
        }
        .now-cover img { width: 100%; height: 100%; object-fit: cover; }
        .now-copy { min-width: 0; }
        .now-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
        .now-meta, .now-targets { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--secondary-text-color); font-size: .82rem; }
        .now-meta { margin-top: 5px; }
        .now-targets { margin-top: 7px; }
        .controls { display: grid; gap: 14px; }
        .transport-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
        .transport {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          min-height: 44px;
          padding: 8px;
          border: 1px solid var(--divider-color);
          border-radius: 11px;
          color: var(--primary-text-color);
          background: var(--secondary-background-color);
          font-weight: 600;
        }
        .transport:hover:not(:disabled) { border-color: var(--primary-color); color: var(--primary-color); }
        .transport.stop { color: var(--error-color); }
        .volume-row { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 9px; }
        input[type="range"] { width: 100%; accent-color: var(--primary-color); }
        .results { display: grid; gap: 8px; max-height: 370px; overflow: auto; padding-right: 2px; }
        .result {
          display: grid;
          grid-template-columns: 54px minmax(0, 1fr) auto;
          gap: 11px;
          align-items: center;
          padding: 8px;
          border: 1px solid var(--divider-color);
          border-radius: 12px;
          background: color-mix(in srgb, var(--secondary-background-color) 72%, transparent);
        }
        .cover { width: 54px; height: 54px; border-radius: 8px; object-fit: cover; background: var(--divider-color); }
        .track { min-width: 0; }
        .track-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
        .track-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--secondary-text-color); font-size: .8rem; margin-top: 4px; }
        .play-result {
          display: grid;
          place-items: center;
          width: 38px;
          height: 38px;
          border: 0;
          border-radius: 50%;
          color: var(--text-primary-color, #fff);
          background: var(--primary-color);
        }
        .empty { padding: 22px 8px; text-align: center; color: var(--secondary-text-color); }
        @media (max-width: 520px) {
          .wrap { padding: 16px; }
          form { grid-template-columns: 1fr; }
          .transport-row { grid-template-columns: 1fr 1fr; }
          .transport { min-height: 48px; }
        }
      </style>
      <ha-card>
        <div class="wrap">
          <header>
            <div>
              <h2></h2>
              <p class="subtitle">Nguồn nhạc độc lập · loa là thiết bị phát</p>
            </div>
            <ha-icon icon="mdi:music-circle"></ha-icon>
          </header>

          <div class="source-switch" role="group" aria-label="Nguồn nhạc">
            <button class="source-button" type="button" data-source="youtube">YouTube</button>
            <button class="source-button" type="button" data-source="zing">Zing MP3</button>
          </div>

          <form>
            <input type="search" maxlength="120" autocomplete="off" aria-label="Tìm tên bài hát hoặc ca sĩ" placeholder="Tìm tên bài hát hoặc ca sĩ…" required />
            <button class="primary search-button" type="submit">Tìm kiếm</button>
          </form>
          <p class="status" role="status" aria-live="polite"></p>

          <section class="section">
            <div class="section-title">
              <h3>Chọn loa / màn hình</h3>
              <span class="hint selected-count">0 đã chọn</span>
            </div>
            <div class="players"></div>
          </section>

          <section class="section">
            <div class="section-title">
              <h3>Đang phát</h3>
              <span class="hint now-state">Chưa phát</span>
            </div>
            <div class="now-playing">
              <div class="now-cover">
                <ha-icon icon="mdi:music-note"></ha-icon>
                <img alt="" hidden />
              </div>
              <div class="now-copy">
                <div class="now-title">Chưa phát bài nào</div>
                <div class="now-meta">Chọn một bài trong kết quả để bắt đầu.</div>
                <div class="now-targets">Chưa chọn thiết bị phát</div>
              </div>
            </div>
          </section>

          <section class="section controls">
            <div class="section-title">
              <h3>Điều khiển các thiết bị đã chọn</h3>
              <span class="hint transport-state">Chưa chọn thiết bị</span>
            </div>
            <div class="transport-row" role="group" aria-label="Điều khiển phát nhạc">
              <button class="transport previous" type="button" data-service="media_previous_track" aria-label="Bài trước">
                <ha-icon icon="mdi:skip-previous"></ha-icon><span>Bài trước</span>
              </button>
              <button class="transport play-pause" type="button" data-service="media_play_pause" aria-label="Phát hoặc tạm dừng">
                <ha-icon icon="mdi:play"></ha-icon><span>Phát / Tạm dừng</span>
              </button>
              <button class="transport next" type="button" data-service="media_next_track" aria-label="Bài tiếp theo">
                <ha-icon icon="mdi:skip-next"></ha-icon><span>Bài tiếp</span>
              </button>
              <button class="transport stop" type="button" data-service="media_stop" aria-label="Dừng phát nhạc">
                <ha-icon icon="mdi:stop"></ha-icon><span>Dừng</span>
              </button>
            </div>
            <div>
              <div class="section-title"><h3>Âm lượng</h3></div>
              <div class="volume-row">
                <ha-icon icon="mdi:volume-medium"></ha-icon>
                <input class="volume" type="range" min="0" max="1" step="0.01" value="0.35" aria-label="Âm lượng các thiết bị đã chọn" />
                <span class="volume-value">35%</span>
              </div>
            </div>
          </section>

          <section class="section">
            <div class="section-title">
              <h3>Kết quả</h3>
              <span class="hint source-hint"></span>
            </div>
            <div class="results"><div class="empty">Nhập từ khóa để tìm nhạc.</div></div>
          </section>
        </div>
      </ha-card>`;
    this.shadowRoot.querySelector("h2").textContent = this._config.title;
  }

  _bindEvents() {
    this.shadowRoot.querySelectorAll(".source-button").forEach((button) => {
      button.addEventListener("click", () => {
        this._source = button.dataset.source;
        this._results = [];
        this._updateSourceButtons();
        this._syncPlayers();
        this._renderResults();
        this._setStatus("");
      });
    });
    this.shadowRoot.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      this._search();
    });
    const volume = this.shadowRoot.querySelector(".volume");
    volume.addEventListener("input", () => {
      this.shadowRoot.querySelector(".volume-value").textContent = `${Math.round(Number(volume.value) * 100)}%`;
    });
    volume.addEventListener("change", () => this._setVolume());
    this.shadowRoot.querySelector(".previous").addEventListener("click", () => this._transport("media_previous_track"));
    this.shadowRoot.querySelector(".play-pause").addEventListener("click", () => this._transport("media_play_pause"));
    this.shadowRoot.querySelector(".next").addEventListener("click", () => this._transport("media_next_track"));
    this.shadowRoot.querySelector(".stop").addEventListener("click", () => this._stop());
  }

  _entryId() {
    return (
      this._config.entry_id ||
      this._hass?.states?.[this._config.entity]?.attributes?.config_entry_id ||
      ""
    );
  }

  _syncPlayers() {
    if (!this._hass) return;
    const virtualEntity = this._config.entity;
    const players = Object.entries(this._hass.states)
      .filter(([entityId]) => entityId.startsWith("media_player.") && entityId !== virtualEntity)
      .sort((left, right) => this._friendlyName(left).localeCompare(this._friendlyName(right), "vi"));

    if (!this._defaultsApplied) {
      const configuredDefaults = Array.isArray(this._config.entities)
        ? this._config.entities
        : [this._hass.states[virtualEntity]?.attributes?.target_entity_id].filter(Boolean);
      configuredDefaults.forEach((entityId) => this._selectedPlayers.add(entityId));
      this._defaultsApplied = true;
    }
    const available = new Set(players.map(([entityId]) => entityId));
    [...this._selectedPlayers].forEach((entityId) => {
      if (!available.has(entityId)) this._selectedPlayers.delete(entityId);
    });

    const container = this.shadowRoot.querySelector(".players");
    container.replaceChildren();
    if (!players.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Không tìm thấy media_player nào khác.";
      container.append(empty);
    }
    for (const [entityId, state] of players) {
      const label = document.createElement("label");
      label.className = "player-chip";
      const isAudioOnly = state.attributes.device_class === "speaker";
      const supportsPlayback = this._supportsFeature(entityId, 512);
      const incompatible = !supportsPlayback || (this._source === "youtube" && isAudioOnly);
      label.classList.toggle("source-incompatible", incompatible);
      label.title = incompatible
        ? (supportsPlayback
          ? "Nguồn YouTube cần màn hình/Android TV; loa này nhận nguồn audio trực tiếp như Zing."
          : "Entity này không khai báo hỗ trợ play_media.")
        : (isAudioOnly ? "Thiết bị phát âm thanh" : "Màn hình hoặc media player");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = this._selectedPlayers.has(entityId);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) this._selectedPlayers.add(entityId);
        else this._selectedPlayers.delete(entityId);
        this._updateSelectedCount();
        this._updateTransportState();
        this._syncNowPlaying();
      });
      const name = document.createElement("span");
      name.className = "player-name";
      name.textContent = state.attributes.friendly_name || entityId;
      const deviceIcon = document.createElement("ha-icon");
      deviceIcon.className = "device-icon";
      deviceIcon.setAttribute("icon", isAudioOnly ? "mdi:speaker" : "mdi:television-play");
      label.append(checkbox, name, deviceIcon);
      container.append(label);
    }
    this._updateSelectedCount();
    this._updateTransportState();
    this._syncNowPlaying();
  }

  _friendlyName([entityId, state]) {
    return state.attributes.friendly_name || entityId;
  }

  _updateSelectedCount() {
    this.shadowRoot.querySelector(".selected-count").textContent = `${this._selectedPlayers.size} đã chọn`;
  }

  _supportsFeature(entityId, feature) {
    const value = Number(this._hass?.states?.[entityId]?.attributes?.supported_features || 0);
    return Boolean(value & feature);
  }

  _targetsForService(service) {
    const featureByService = {
      media_previous_track: 16,
      media_next_track: 32,
      media_stop: 4096,
      volume_set: 4,
    };
    return [...this._selectedPlayers].filter((entityId) => {
      const state = this._hass?.states?.[entityId];
      if (!state || state.state === "unavailable") return false;
      if (service === "media_play_pause") {
        return this._supportsFeature(entityId, 1) || this._supportsFeature(entityId, 16384);
      }
      return this._supportsFeature(entityId, featureByService[service] || 0);
    });
  }

  _playTargets() {
    return [...this._selectedPlayers].filter((entityId) => {
      const state = this._hass?.states?.[entityId];
      if (!state || state.state === "unavailable" || !this._supportsFeature(entityId, 512)) return false;
      return this._source !== "youtube" || state.attributes.device_class !== "speaker";
    });
  }

  _updateTransportState() {
    if (!this.shadowRoot || !this._hass) return;
    const selectedStates = [...this._selectedPlayers]
      .map((entityId) => this._hass.states[entityId]?.state)
      .filter(Boolean);
    const anyPlaying = selectedStates.includes("playing");
    const anyPaused = selectedStates.includes("paused");
    const stateLabel = this.shadowRoot.querySelector(".transport-state");
    stateLabel.textContent = !selectedStates.length
      ? "Chưa chọn thiết bị"
      : anyPlaying
        ? "Đang phát"
        : anyPaused
          ? "Đang tạm dừng"
          : "Sẵn sàng";
    this.shadowRoot.querySelector(".play-pause ha-icon")
      .setAttribute("icon", anyPlaying ? "mdi:pause" : "mdi:play");
    this.shadowRoot.querySelectorAll(".transport").forEach((button) => {
      button.disabled = button.dataset.service === "media_stop"
        ? !selectedStates.length && !this._currentItem
        : !this._targetsForService(button.dataset.service).length;
    });
    this.shadowRoot.querySelector(".volume").disabled = !this._targetsForService("volume_set").length;
  }

  _storageKey() {
    return `tritue-player:${this._config?.entity || "default"}:now-playing`;
  }

  _restoreNowPlaying() {
    try {
      const saved = globalThis.localStorage?.getItem(this._storageKey());
      this._currentItem = saved ? JSON.parse(saved) : null;
    } catch (_error) {
      this._currentItem = null;
    }
  }

  _rememberNowPlaying(item, entityIds) {
    this._currentItem = {
      source: this._source,
      id: String(item.id || ""),
      title: String(item.title || item.id || "Không rõ tên"),
      channel: String(item.channel || ""),
      thumbnail: /^https?:\/\//.test(item.thumbnail || "") ? item.thumbnail : "",
      duration: Number(item.duration || 0),
      entity_ids: entityIds,
      started_at: Date.now(),
    };
    try {
      globalThis.localStorage?.setItem(this._storageKey(), JSON.stringify(this._currentItem));
    } catch (_error) {
      // The card still works when browser storage is disabled.
    }
  }

  _clearRememberedNowPlaying() {
    this._currentItem = null;
    try {
      globalThis.localStorage?.removeItem(this._storageKey());
    } catch (_error) {
      // Ignore unavailable browser storage.
    }
  }

  _syncNowPlaying() {
    if (!this.shadowRoot || !this._hass) return;
    const selected = [...this._selectedPlayers]
      .map((entityId) => [entityId, this._hass.states[entityId]])
      .filter(([, state]) => state);
    const active = selected.find(([, state]) => state.state === "playing")
      || selected.find(([, state]) => state.state === "paused")
      || selected.find(([, state]) => state.attributes.media_title);
    const state = active?.[1];
    const attributes = state?.attributes || {};
    const fallback = this._currentItem || {};
    const title = attributes.media_title || fallback.title || "";
    const artist = attributes.media_artist || fallback.channel || "";
    const duration = this._formatDuration(attributes.media_duration || fallback.duration);
    const imageUrl = attributes.entity_picture || attributes.media_image_url || fallback.thumbnail || "";
    const targetIds = fallback.entity_ids?.length ? fallback.entity_ids : [...this._selectedPlayers];
    const targetNames = targetIds
      .map((entityId) => this._hass.states[entityId]?.attributes?.friendly_name || entityId)
      .filter(Boolean);

    this.shadowRoot.querySelector(".now-title").textContent = title || "Chưa phát bài nào";
    this.shadowRoot.querySelector(".now-meta").textContent = title
      ? [artist, duration, fallback.source === "zing" ? "Zing MP3" : fallback.source === "youtube" ? "YouTube" : ""]
        .filter(Boolean).join(" · ")
      : "Chọn một bài trong kết quả để bắt đầu.";
    this.shadowRoot.querySelector(".now-targets").textContent = targetNames.length
      ? `Thiết bị: ${targetNames.join(", ")}`
      : "Chưa chọn thiết bị phát";
    this.shadowRoot.querySelector(".now-state").textContent = state?.state === "playing"
      ? "Đang phát"
      : state?.state === "paused"
        ? "Tạm dừng"
        : title
          ? "Đã gửi"
          : "Chưa phát";

    const image = this.shadowRoot.querySelector(".now-cover img");
    const icon = this.shadowRoot.querySelector(".now-cover ha-icon");
    image.hidden = !/^https?:\/\//.test(imageUrl);
    icon.hidden = !image.hidden;
    if (!image.hidden && image.src !== imageUrl) image.src = imageUrl;
  }

  _updateSourceButtons() {
    if (!this.shadowRoot) return;
    this.shadowRoot.querySelectorAll(".source-button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.source === this._source));
    });
    const hint = this.shadowRoot.querySelector(".source-hint");
    hint.textContent = this._source === "youtube" ? "Phát bằng YouTube chính thức" : "Bài công khai, không VIP";
  }

  async _search() {
    const query = this.shadowRoot.querySelector('input[type="search"]').value.trim();
    const entryId = this._entryId();
    if (!entryId) {
      this._setStatus("Không tìm thấy config entry. Hãy tải lại integration.", true);
      return;
    }
    if (!query) return;
    const button = this.shadowRoot.querySelector(".search-button");
    button.disabled = true;
    this._setStatus("Đang tìm kiếm…");
    try {
      const payload = await this._hass.callApi("GET", `tritue_youtube_player/search?entry_id=${encodeURIComponent(entryId)}&source=${encodeURIComponent(this._source)}&q=${encodeURIComponent(query)}&limit=20`);
      this._results = Array.isArray(payload.items) ? payload.items : [];
      this._renderResults();
      this._setStatus(this._results.length ? `Tìm thấy ${this._results.length} bài.` : "Không tìm thấy bài phù hợp.");
    } catch (error) {
      this._results = [];
      this._renderResults();
      this._setStatus(error?.message || "Không thể tìm kiếm lúc này.", true);
    } finally {
      button.disabled = false;
    }
  }

  _renderResults() {
    const container = this.shadowRoot.querySelector(".results");
    container.replaceChildren();
    if (!this._results.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Chưa có kết quả.";
      container.append(empty);
      return;
    }
    for (const item of this._results) {
      const row = document.createElement("article");
      row.className = "result";
      const image = document.createElement("img");
      image.className = "cover";
      image.alt = "";
      image.loading = "lazy";
      if (/^https?:\/\//.test(item.thumbnail || "")) image.src = item.thumbnail;
      const track = document.createElement("div");
      track.className = "track";
      const title = document.createElement("div");
      title.className = "track-title";
      title.textContent = item.title || item.id || "Không rõ tên";
      const meta = document.createElement("div");
      meta.className = "track-meta";
      const duration = this._formatDuration(item.duration);
      meta.textContent = [item.channel, duration].filter(Boolean).join(" · ");
      track.append(title, meta);
      const play = document.createElement("button");
      play.className = "play-result";
      play.type = "button";
      play.title = `Phát ${title.textContent}`;
      play.setAttribute("aria-label", play.title);
      play.textContent = "▶";
      play.addEventListener("click", () => this._playResult(item, play));
      row.append(image, track, play);
      container.append(row);
    }
  }

  async _playResult(item, button) {
    const requestedCount = this._selectedPlayers.size;
    const entityIds = this._playTargets();
    if (!entityIds.length) {
      this._setStatus(
        requestedCount
          ? "Thiết bị đã chọn không hỗ trợ nguồn này. Với loa, hãy dùng Zing hoặc URL audio trực tiếp."
          : "Hãy chọn ít nhất một loa hoặc màn hình.",
        true,
      );
      return;
    }
    const entryId = this._entryId();
    if (!entryId) {
      this._setStatus("Không tìm thấy config entry của integration.", true);
      return;
    }
    button.disabled = true;
    this._setStatus(`Đang phát “${item.title || item.id}”…`);
    try {
      await this._hass.callService("tritue_youtube_player", "play_on_players", {
        entry_id: entryId,
        source: this._source,
        target: item.url || item.id,
        entity_id: entityIds,
        volume_level: Number(this.shadowRoot.querySelector(".volume").value),
      });
      this._rememberNowPlaying(item, entityIds);
      this._syncNowPlaying();
      const ignored = requestedCount - entityIds.length;
      this._setStatus(
        ignored
          ? `Đã gửi tới ${entityIds.length} thiết bị; bỏ qua ${ignored} thiết bị không tương thích.`
          : `Đã gửi tới ${entityIds.length} thiết bị.`,
      );
    } catch (error) {
      this._setStatus(error?.message || "Không thể phát bài đã chọn.", true);
    } finally {
      button.disabled = false;
    }
  }

  async _setVolume() {
    const entityIds = this._targetsForService("volume_set");
    if (!entityIds.length) {
      this._setStatus("Thiết bị đã chọn không hỗ trợ đặt âm lượng tuyệt đối.", true);
      return;
    }
    try {
      await this._hass.callService("media_player", "volume_set", {
        entity_id: entityIds,
        volume_level: Number(this.shadowRoot.querySelector(".volume").value),
      });
      this._setStatus(`Đã đặt âm lượng cho ${entityIds.length} thiết bị.`);
    } catch (error) {
      this._setStatus(error?.message || "Không thể đổi âm lượng.", true);
    }
  }

  async _transport(service) {
    const entityIds = this._targetsForService(service);
    if (!entityIds.length) {
      this._setStatus("Không có thiết bị đã chọn hỗ trợ lệnh này.", true);
      return;
    }
    const labels = {
      media_previous_track: "bài trước",
      media_play_pause: "phát/tạm dừng",
      media_next_track: "bài tiếp theo",
    };
    const button = this.shadowRoot.querySelector(`[data-service="${service}"]`);
    button.disabled = true;
    try {
      await this._hass.callService("media_player", service, { entity_id: entityIds });
      this._setStatus(`Đã gửi lệnh ${labels[service]} tới ${entityIds.length} thiết bị.`);
    } catch (error) {
      this._setStatus(error?.message || "Không thể điều khiển thiết bị.", true);
    } finally {
      this._updateTransportState();
    }
  }

  async _stop() {
    const entityIds = this._targetsForService("media_stop");
    if (!this._selectedPlayers.size && !this._currentItem) {
      this._setStatus("Hãy chọn ít nhất một thiết bị để dừng.", true);
      return;
    }
    try {
      const stopTargets = [...entityIds, this._config.entity];
      await this._hass.callService("media_player", "media_stop", { entity_id: stopTargets });
      this._clearRememberedNowPlaying();
      this._syncNowPlaying();
      this._setStatus(`Đã gửi lệnh dừng tới ${entityIds.length} thiết bị.`);
    } catch (error) {
      this._setStatus(error?.message || "Không thể dừng thiết bị.", true);
    }
  }

  _formatDuration(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value <= 0) return "";
    const minutes = Math.floor(value / 60);
    return `${minutes}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
  }

  _setStatus(message, error = false) {
    const status = this.shadowRoot.querySelector(".status");
    status.textContent = message;
    status.classList.toggle("error", error);
  }
}

if (!customElements.get("tritue-youtube-player-card")) {
  customElements.define("tritue-youtube-player-card", TriTueYouTubePlayerCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "tritue-youtube-player-card",
  name: "TriTue Music Player",
  description: "Search YouTube/Zing and play on one or more Home Assistant media players.",
  preview: true,
});
