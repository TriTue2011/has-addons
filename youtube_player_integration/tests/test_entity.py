import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
COMPONENT_DIR = ROOT / "custom_components" / "tritue_youtube_player"


class FakeCoordinatorEntity:
    def __class_getitem__(cls, _item):
        return cls

    def __init__(self, coordinator):
        self.coordinator = coordinator


class FakeDeviceInfo(dict):
    def __init__(self, **kwargs):
        super().__init__(kwargs)


def load_entity_module():
    homeassistant = types.ModuleType("homeassistant")
    homeassistant_const = types.ModuleType("homeassistant.const")
    homeassistant_const.CONF_URL = "url"
    homeassistant_helpers = types.ModuleType("homeassistant.helpers")
    device_registry = types.ModuleType("homeassistant.helpers.device_registry")
    device_registry.DeviceInfo = FakeDeviceInfo
    update_coordinator = types.ModuleType(
        "homeassistant.helpers.update_coordinator"
    )
    update_coordinator.CoordinatorEntity = FakeCoordinatorEntity

    component_package = types.ModuleType(
        "custom_components.tritue_youtube_player"
    )
    component_package.__path__ = [str(COMPONENT_DIR)]
    component_const = types.ModuleType(
        "custom_components.tritue_youtube_player.const"
    )
    component_const.DOMAIN = "tritue_youtube_player"
    component_coordinator = types.ModuleType(
        "custom_components.tritue_youtube_player.coordinator"
    )
    component_coordinator.YouTubePlayerConfigEntry = object
    component_coordinator.YouTubePlayerCoordinator = object

    modules = {
        "homeassistant": homeassistant,
        "homeassistant.const": homeassistant_const,
        "homeassistant.helpers": homeassistant_helpers,
        "homeassistant.helpers.device_registry": device_registry,
        "homeassistant.helpers.update_coordinator": update_coordinator,
        "custom_components.tritue_youtube_player": component_package,
        "custom_components.tritue_youtube_player.const": component_const,
        "custom_components.tritue_youtube_player.coordinator": component_coordinator,
    }
    module_name = "custom_components.tritue_youtube_player.entity"
    spec = importlib.util.spec_from_file_location(
        module_name, COMPONENT_DIR / "entity.py"
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("unable_to_load_entity_module")
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, modules):
        spec.loader.exec_module(module)
    return module


class YouTubePlayerEntityTests(unittest.TestCase):
    def test_base_entity_retains_config_entry_for_runtime_properties(self):
        module = load_entity_module()
        coordinator = types.SimpleNamespace(data={"app_version": "0.3.0"})
        entry = types.SimpleNamespace(
            unique_id="server-id",
            entry_id="entry-id",
            title="TriTue YouTube Player",
            data={"url": "http://127.0.0.1:8099"},
        )

        entity = module.YouTubePlayerEntity(coordinator, entry)

        self.assertIs(entry, entity.entry)


if __name__ == "__main__":
    unittest.main()
