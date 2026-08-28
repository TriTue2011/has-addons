class TriTueYouTubePlayerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._source = "youtube";
    this._selectedPlayers = new Set();
    this._results = [];
    this._rendered = false;
    this._defaultsApplied = false;
  }

  setConfig(config) {
    if (!config || typeof config.entity !== "string") {
      throw new Error("TriTue card requires a media_player entity");
    }
    this._config = { title: "TriTue Music", ...config };
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
    return 8;
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
        .primary, .stop {
          border: 0;
          border-radius: 11px;
          padding: 10px 15px;
          font-weight: 650;
        }
        .primary { color: var(--text-primary-color, #fff); background: var(--primary-color); }
        .stop { color: var(--error-color); background: color-mix(in srgb, var(--error-color) 12%, transparent); }
        button:disabled { cursor: wait; opacity: .55; }
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
        .player-chip input { accent-color: var(--primary-color); }
        .player-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .controls { display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 12px; }
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
          .controls { grid-template-columns: 1fr; }
          .stop { width: 100%; }
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

          <section class="section controls">
            <div>
              <div class="section-title"><h3>Âm lượng</h3></div>
              <div class="volume-row">
                <ha-icon icon="mdi:volume-medium"></ha-icon>
                <input class="volume" type="range" min="0" max="1" step="0.01" value="0.35" aria-label="Âm lượng các thiết bị đã chọn" />
                <span class="volume-value">35%</span>
              </div>
            </div>
            <button class="stop" type="button">Dừng các loa đã chọn</button>
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
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = this._selectedPlayers.has(entityId);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) this._selectedPlayers.add(entityId);
        else this._selectedPlayers.delete(entityId);
        this._updateSelectedCount();
      });
      const name = document.createElement("span");
      name.className = "player-name";
      name.textContent = state.attributes.friendly_name || entityId;
      label.append(checkbox, name);
      container.append(label);
    }
    this._updateSelectedCount();
  }

  _friendlyName([entityId, state]) {
    return state.attributes.friendly_name || entityId;
  }

  _updateSelectedCount() {
    this.shadowRoot.querySelector(".selected-count").textContent = `${this._selectedPlayers.size} đã chọn`;
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
    const entityIds = [...this._selectedPlayers];
    if (!entityIds.length) {
      this._setStatus("Hãy chọn ít nhất một loa hoặc màn hình.", true);
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
      this._setStatus(`Đã gửi tới ${entityIds.length} thiết bị.`);
    } catch (error) {
      this._setStatus(error?.message || "Không thể phát bài đã chọn.", true);
    } finally {
      button.disabled = false;
    }
  }

  async _setVolume() {
    const entityIds = [...this._selectedPlayers];
    if (!entityIds.length) return;
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

  async _stop() {
    const entityIds = [...this._selectedPlayers];
    if (!entityIds.length) {
      this._setStatus("Hãy chọn ít nhất một thiết bị để dừng.", true);
      return;
    }
    try {
      const stopTargets = [...entityIds, this._config.entity];
      await this._hass.callService("media_player", "media_stop", { entity_id: stopTargets });
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
