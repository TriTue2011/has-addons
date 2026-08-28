import ast
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
COMPONENT_DIR = ROOT / "custom_components" / "tritue_youtube_player"


class LovelaceCardContractTests(unittest.TestCase):
    def test_services_do_not_import_removed_home_assistant_volume_constant(self):
        source = (COMPONENT_DIR / "services.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        imported_names = {
            alias.name
            for node in tree.body
            if isinstance(node, ast.ImportFrom)
            and node.module == "homeassistant.const"
            for alias in node.names
        }

        self.assertNotIn("ATTR_VOLUME_LEVEL", imported_names)

    def test_integration_ships_multi_speaker_search_card(self):
        script = (COMPONENT_DIR / "www" / "tritue-youtube-player-card.js").read_text(
            encoding="utf-8"
        )

        self.assertIn(
            'customElements.define("tritue-youtube-player-card"', script
        )
        self.assertIn('callApi("GET", `tritue_youtube_player/search?', script)
        self.assertIn('callService("tritue_youtube_player", "play_on_players"', script)
        self.assertIn('callService("media_player", "volume_set"', script)
        self.assertIn('callService("media_player", "media_stop"', script)
        self.assertIn("const stopTargets = [...entityIds, this._config.entity]", script)
        self.assertIn('aria-label="Tìm tên bài hát hoặc ca sĩ"', script)
        self.assertIn('aria-label="Âm lượng các thiết bị đã chọn"', script)
        self.assertNotIn("eval(", script)

    def test_http_dependency_and_service_description_are_packaged(self):
        manifest = json.loads(
            (COMPONENT_DIR / "manifest.json").read_text(encoding="utf-8")
        )
        services = (COMPONENT_DIR / "services.yaml").read_text(encoding="utf-8")

        self.assertIn("http", manifest["dependencies"])
        self.assertIn("play_on_players:", services)
        self.assertIn("multiple: true", services)

    def test_manifest_key_order_matches_hassfest(self):
        manifest = json.loads(
            (COMPONENT_DIR / "manifest.json").read_text(encoding="utf-8")
        )

        self.assertEqual(
            [
                "domain",
                "name",
                "codeowners",
                "config_flow",
                "dependencies",
                "documentation",
                "integration_type",
                "iot_class",
                "issue_tracker",
                "requirements",
                "version",
            ],
            list(manifest),
        )

    def test_init_declares_config_entry_only_schema(self):
        init_source = (COMPONENT_DIR / "__init__.py").read_text(encoding="utf-8")

        self.assertIn("CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)", init_source)


if __name__ == "__main__":
    unittest.main()
