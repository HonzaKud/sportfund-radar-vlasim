import json
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit
ROOT = Path(__file__).resolve().parents[1]
def validate(data):
    assert data["schemaVersion"] == 1
    source_ids = {s["id"] for s in data["sources"]}
    assert len(source_ids) == len(data["sources"])
    for source in data["sources"]:
        assert urlsplit(source["url"]).scheme == "https"
    ids = set()
    for item in data["opportunities"]:
        assert item["id"] not in ids
        ids.add(item["id"])
        assert item["status"] in ("open","verify","watch","idea","awarded","closed")
        assert isinstance(item["score"], int) and 0 <= item["score"] <= 100
        assert item["grade"] == ("A" if item["score"] >= 80 else "B" if item["score"] >= 60 else "C")
        assert item["sourceIds"] and set(item["sourceIds"]) <= source_ids
        assert all(item[k] for k in ("title","why","next","fact","checklist","history","verifiedAt","firstFound","lastChecked"))
        date.fromisoformat(item["verifiedAt"])
        if item["deadline"]:
            date.fromisoformat(item["deadline"])
        if item["amount"]:
            assert item["amount"]["kind"] == "estimate"
            assert 0 <= item["amount"]["min"] <= item["amount"]["max"]
        if item.get("confirmedAmount"):
            assert item["status"] == "awarded" and item["amount"] is None
        assert not (item.get("existing") and item.get("relationship") == "new")
    for partner in data["partners"]:
        assert partner["sourceId"] in source_ids and partner["aliases"]
    signal_ids = set()
    for signal in data["signals"]:
        assert signal["id"] not in signal_ids
        signal_ids.add(signal["id"])
        assert signal["status"] == "unreviewed" and signal["sourceId"] in source_ids
        assert urlsplit(signal["url"]).scheme == "https" and 0 <= signal["score"] <= 79
    for record in data["sourceChecks"]:
        assert record["sourceId"] in source_ids and record["status"] in ("ok","error")
    return True
if __name__ == "__main__":
    data = json.loads((ROOT / "data/radar.json").read_text(encoding="utf-8"))
    validate(data)
    print("Validated:",len(data["opportunities"]),"opportunities;",len(data["signals"]),"signals")

