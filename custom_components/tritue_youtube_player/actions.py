"""Source-to-speaker dispatch shared by Home Assistant service actions."""

from __future__ import annotations

from typing import Any

from .playback import (
    build_stream_request,
    build_target_request,
    normalize_target_entity_ids,
)


async def async_play_on_players(
    hass: Any,
    client: Any,
    *,
    source: str,
    target: str,
    entity_ids: Any,
    target_platforms: dict[str, str | None],
    volume_level: float | None = None,
    excluded_entity_ids: set[str] | None = None,
) -> dict[str, Any]:
    """Resolve one source item and dispatch it to one or more HA players."""
    targets = normalize_target_entity_ids(
        entity_ids, excluded=excluded_entity_ids or set()
    )
    if volume_level is not None:
        volume_level = float(volume_level)
        if not 0 <= volume_level <= 1:
            raise ValueError("invalid_volume_level")
        await hass.services.async_call(
            "media_player",
            "volume_set",
            {"volume_level": volume_level},
            blocking=True,
            target={"entity_id": targets},
        )

    if source == "zing":
        stream = await client.async_create_stream("zing", target)
        service_data = build_stream_request(stream)
        await hass.services.async_call(
            "media_player",
            "play_media",
            service_data,
            blocking=True,
            target={"entity_id": targets},
        )
    elif source == "youtube":
        played = await client.async_play(target)
        item = played.get("item") or {}
        for entity_id in targets:
            service_data = build_target_request(
                item,
                target_platform=target_platforms.get(entity_id),
                requested_media_type="video",
            )
            await hass.services.async_call(
                "media_player",
                "play_media",
                service_data,
                blocking=True,
                target={"entity_id": entity_id},
            )
    else:
        raise ValueError("unsupported_source")

    return {"source": source, "target_count": len(targets)}
