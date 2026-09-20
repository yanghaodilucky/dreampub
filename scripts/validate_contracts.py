"""Validate wire contracts and regression cases; no server or LLM required."""

from copy import deepcopy
import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[1] / "contracts"


def read(name):
    return json.loads((ROOT / name).read_text())


def main():
    schemas = {name: read(f"{name}.schema.json") for name in (
        "world_event", "npc_action", "websocket_event"
    )}
    registry = Registry().with_resources(
        (schema["$id"], Resource.from_contents(schema))
        for schema in schemas.values()
    )
    validators = {}
    for name, schema in schemas.items():
        Draft202012Validator.check_schema(schema)
        validators[name] = Draft202012Validator(
            schema, registry=registry, format_checker=FormatChecker()
        )

    count = 0

    def check(name, value, expected=True):
        nonlocal count
        errors = list(validators[name].iter_errors(value))
        if (not bool(errors)) != expected:
            detail = errors[0].message if errors else "Invalid input was accepted"
            raise AssertionError(f"{name}: {detail}")
        count += 1

    event = read("examples/focus.started.json")
    speech = read("examples/npc.speak.json")
    check("world_event", event)
    check("npc_action", speech)
    check("websocket_event", read("examples/websocket.world-event.json"))
    check("websocket_event", read("examples/websocket.snapshot.json"))
    for action in (
        {"action": "move", "target_anchor_id": "window_seat"},
        {"action": "start_focus", "activity": "drawing", "duration_minutes": 45},
        {"action": "wait", "duration_seconds": 30},
    ):
        check("npc_action", action)

    for changes in (
        {"timestamp": 0},
        {"event_id": "not-a-uuid"},
        {"sequence": 0},
        {"type": "weather.changed"},
        {"type": "npc.spoke"},  # Valid type, wrong payload and actor.
        {"actor_kind": "npc"},
        {"payload": {"session_id": "missing-required-fields"}},
        {"unexpected": True},
    ):
        check("world_event", {**event, **changes}, False)
    bad_duration = deepcopy(event)
    bad_duration["payload"]["planned_duration_seconds"] = -1
    check("world_event", bad_duration, False)
    for action in (
        {**speech, "actor_id": "spoofed"},
        {**speech, "content": ""},
        {**speech, "emotion": "unknown"},
        {"action": "execute_sql", "sql": "SELECT 1"},
        {"action": "move", "x": 123, "y": 45},
        {"action": "wait", "duration_seconds": 301},
        {"action": "start_focus", "activity": "drawing", "duration_minutes": "45"},
        {"action": "start_focus", "activity": "drawing", "duration_minutes": 121},
    ):
        check("npc_action", action, False)

    for message in (
        {"kind": "resume", "world_id": "world_haodi", "last_sequence": 1, "stream_id": None},
        {"kind": "movement.intent", "input_id": "input_1", "direction": "left"},
        {"kind": "resync.required", "world_id": "world_haodi", "reason": "stream_changed"},
        {"kind": "state.delta", "world_id": "world_haodi", "location_id": "library_001",
         "stream_id": "room_boot_001", "revision": 1, "server_time": "2026-09-12T13:00:00Z",
         "entities": [], "removed_actor_ids": ["npc_mira"]},
    ):
        check("websocket_event", {"schema_version": 1, **message})
    check("websocket_event", {"schema_version": 2, "kind": "world.event", "event": event}, False)
    check("websocket_event", {"schema_version": 1, "kind": "world.event", "event": {**event, "sequence": 0}}, False)
    print(f"Validated 3 schemas and {count} positive/negative contract cases.")


if __name__ == "__main__":
    main()
