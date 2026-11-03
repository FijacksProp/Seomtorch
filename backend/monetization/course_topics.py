"""Catalog topic IDs shared by content delivery, practice and subscriptions."""

DEFAULT_FREE_TOPICS = {
    "ANA 201": "ul-bones",
    "ANA 203": "ge-gametes",
    "PIO 201": "pio-transport-homeostasis",
}

LEGACY_TOPIC_IDS = {
    "ANA 203": {"week-one": "ge-week-one"},
    "PIO 201": {"transport-homeostasis": "pio-transport-homeostasis"},
}


def canonical_topic_id(course_code, topic_id):
    code = str(course_code or "").strip().upper()
    topic = str(topic_id or "").strip().casefold()
    return LEGACY_TOPIC_IDS.get(code, {}).get(topic, topic)
