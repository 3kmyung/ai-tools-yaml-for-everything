"""Put the scripts directory on the import path.

`scripts/analyze-model/` is a directory of scripts rather than an installed
package — its modules import each other as siblings, which works when one of
them is run directly and needs arranging here when they are imported by tests.
"""
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[4] / "scripts" / "analyze-model"

if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))
