import json
import unittest
from pathlib import Path
from crawl import Page, links_for, apply_results, safe_url, canonical
from validate import validate
ROOT = Path(__file__).resolve().parents[1]
class RadarTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((ROOT / "data/radar.json").read_text(encoding="utf-8"))
    def test_seed_valid(self):
        self.assertTrue(validate(self.data))
    def test_https_only(self):
        for value in ["http://example.org","file:///etc/passwd","javascript:alert(1)","https://user:pw@example.org/"]:
            self.assertFalse(safe_url(value))
        self.assertTrue(safe_url("https://example.org/news"))
        self.assertEqual(canonical("https://example.org/news/#top"),"https://example.org/news")
    def test_parser_ignores_scripts_and_off_domain_links(self):
        parser = Page()
        parser.feed('<title>Sport</title><script>fake funding</script><a href="/grant">Grant pro sportovní kluby 2027</a><a href="https://evil.org">Grant pro sportovní kluby</a>')
        self.assertNotIn("fake funding",parser.texts)
        self.assertEqual(links_for(parser,"https://example.org/"),[("https://example.org/grant","Grant pro sportovní kluby 2027")])
    def test_error_preserves_success_and_fact_date(self):
        before=self.data["opportunities"][0]["lastChecked"]
        self.data["sourceChecks"]=[{"sourceId":"cez","lastSuccess":"2026-10-01","pages":[]}]
        result={"sourceId":"cez","status":"error","pages":[],"candidates":[],"errors":[],"error":"Timeout"}
        updated=apply_results(self.data,[result],"2026-10-05T06:00:00Z")
        self.assertEqual(updated["opportunities"][0]["lastChecked"],before)
        self.assertEqual(updated["sourceChecks"][0]["lastSuccess"],"2026-10-01")
        self.assertEqual(updated["opportunities"][0]["verifiedAt"],"2026-10-04")
    def test_changed_source_requires_review(self):
        source=next(s for s in self.data["sources"] if s["id"]=="cez")
        u=canonical(source["url"])
        self.data["sourceChecks"]=[{"sourceId":"cez","lastSuccess":"2026-10-01","pages":[{"url":u,"hash":"old"}]}]
        result={"sourceId":"cez","status":"ok","pages":[{"url":u,"hash":"new"}],"candidates":[],"errors":[]}
        updated=apply_results(self.data,[result],"2026-10-05T06:00:00Z")
        self.assertTrue(updated["opportunities"][0]["needsReview"])
        self.assertEqual(updated["opportunities"][0]["verifiedAt"],"2026-10-04")
    def test_expiry_preserves_awarded_history(self):
        updated=apply_results(self.data,[],"2027-01-03T06:00:00Z")
        self.assertEqual(next(i for i in updated["opportunities"] if i["id"]=="cez-regiony")["status"],"closed")
        self.assertEqual(next(i for i in updated["opportunities"] if i["id"]=="muj-klub-2026")["status"],"awarded")
    def test_signal_deduplication(self):
        self.data["signals"]=[]
        candidate={"url":"https://nsa.gov.cz/new-grant","title":"Nová podpora hokejových klubů","context":"mládež hokej Vlašim"}
        result={"sourceId":"nsa","status":"ok","pages":[],"candidates":[candidate],"errors":[]}
        updated=apply_results(self.data,[result],"2026-10-05T06:00:00Z")
        updated=apply_results(updated,[result],"2026-10-06T06:00:00Z")
        self.assertEqual(len(updated["signals"]),1)
        sig=updated["signals"][0]
        self.assertEqual(sig["firstFound"],"2026-10-05T06:00:00Z")
        self.assertEqual(sig["lastChecked"],"2026-10-06T06:00:00Z")
        self.assertEqual(sig["status"],"unreviewed")
        self.assertLessEqual(sig["score"],79)
if __name__ == "__main__":
    unittest.main()

