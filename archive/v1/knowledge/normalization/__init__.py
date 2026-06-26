"""
Normalization Strategy Manager.

Loads YAML strategy files from `knowledge/normalization/` and
negative knowledge from `knowledge/negative/`, then provides
a Python interface for the registry build pipeline.

Architecture:
  Knowledge Base
  ├── Lexical       (spacing, abbreviations, punctuation, capitalization)
  ├── Semantic      (apt↔apartment, chs↔cooperative housing society)
  ├── Domain        (developer-specific conventions)
  ├── Geographic    (locality/pincode aliases — future)
  └── Risk Rules    (negative knowledge, never-merge rules)
"""
import os
import re
import yaml
import hashlib
from typing import Callable

KB_VERSION = "1.1"
STRATEGIES_DIR = os.path.dirname(os.path.abspath(__file__))


class NormalizationStrategy:
    """A single normalization strategy loaded from YAML."""

    def __init__(self, data: dict):
        self.id = data["id"]
        self.classification = data.get("classification", "Unclassified")
        self.description = data.get("description", "")
        self.confidence = data.get("confidence", 0.9)
        self.false_positive_risk = data.get("false_positive_risk", "medium")
        self.auto_apply = data.get("auto_apply", False)
        self.conditions = data.get("conditions", {})
        self.source_applies = data.get("source_applies", [])
        self.source_excludes = data.get("source_excludes", [])
        self.history = data.get("history", {"applied": 0, "rejected": 0})
        self.examples = data.get("examples", [])
        self.provenance = data.get("provenance", {})
        self._compile(data["pattern"])

    def _compile(self, pattern: dict):
        ptype = pattern.get("type", "regex")
        if ptype == "join_variation":
            self.transform = self._identity_transform
        elif ptype == "regex":
            flags = 0
            if pattern.get("flags") == "IGNORECASE":
                flags = re.IGNORECASE
            self._re = re.compile(pattern["pattern"], flags)
            self._replacement = pattern["replacement"]
            self.transform = self._regex_transform
        elif ptype == "string_replace":
            self._from = pattern["from"]
            self._to = pattern["to"]
            self.transform = self._string_transform
        else:
            self.transform = self._identity_transform

    def _regex_transform(self, s: str) -> str:
        return self._re.sub(self._replacement, s)

    def _string_transform(self, s: str) -> str:
        return s.replace(self._from, self._to)

    def _identity_transform(self, s: str) -> str:
        return s

    def applies(self, building: str, area: str = "", developer: str = "",
                source: str = "") -> bool:
        """Check if conditions are met for this strategy to apply."""
        if not self.auto_apply:
            return False
        conds = self.conditions
        if conds.get("same_developer") == "required" and not developer:
            return False
        if conds.get("same_area") == "required" and not area:
            return False
        # Source check
        if source and self.source_excludes and source in self.source_excludes:
            return False
        if source and self.source_applies and source not in self.source_applies:
            return False
        return True

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "classification": self.classification,
            "description": self.description,
            "confidence": self.confidence,
            "false_positive_risk": self.false_positive_risk,
            "auto_apply": self.auto_apply,
            "conditions": self.conditions,
            "source_applies": self.source_applies,
            "source_excludes": self.source_excludes,
            "history": self.history,
            "examples": self.examples[:2],
            "provenance": {k: v for k, v in self.provenance.items()
                           if k in ("created", "last_updated", "approved_by")},
        }


# ── Negative Knowledge ─────────────────────────────────────────
_knowledge_base_version = KB_VERSION
_negative_pairs: list[dict] = []


def load_negative_knowledge() -> list[dict]:
    """Load known-distinct building pairs from knowledge/negative/."""
    pairs = []
    neg_dir = os.path.join(os.path.dirname(STRATEGIES_DIR), "negative")
    if not os.path.isdir(neg_dir):
        return pairs
    for fname in sorted(os.listdir(neg_dir)):
        if not fname.endswith(".yaml"):
            continue
        fpath = os.path.join(neg_dir, fname)
        with open(fpath) as f:
            data = yaml.safe_load(f)
        pairs.extend(data.get("pairs", []))
    return pairs


def is_negative_knowledge(name_a: str, name_b: str, area: str = "") -> bool:
    """Check if two names are known to be different buildings."""
    global _negative_pairs
    if not _negative_pairs:
        _negative_pairs = load_negative_knowledge()
    na, nb = name_a.lower().strip(), name_b.lower().strip()
    if na > nb:
        na, nb = nb, na  # normalize order
    for pair in _negative_pairs:
        p = pair.get("pair", [])
        if len(p) < 2:
            continue
        pa, pb = p[0].lower().strip(), p[1].lower().strip()
        if pa > pb:
            pa, pb = pb, pa
        if (na, nb) == (pa, pb):
            if not area or not pair.get("area"):
                return True
            if area.lower() == pair.get("area", "").lower():
                return True
    return False


# ── Strategy loading ────────────────────────────────────────────
_strategies: dict[str, list[NormalizationStrategy]] = {}


def load_strategies(category: str = "building") -> list[NormalizationStrategy]:
    strategies = []
    cat_dir = os.path.join(STRATEGIES_DIR, category)
    if not os.path.isdir(cat_dir):
        return strategies
    for fname in sorted(os.listdir(cat_dir)):
        if not fname.endswith(".yaml"):
            continue
        fpath = os.path.join(cat_dir, fname)
        with open(fpath) as f:
            data = yaml.safe_load(f)
        for sdata in data.get("strategies", []):
            strategies.append(NormalizationStrategy(sdata))
    return strategies


def get_strategies(category: str = "building", refresh: bool = False) -> list[NormalizationStrategy]:
    if category not in _strategies or refresh:
        _strategies[category] = load_strategies(category)
    return _strategies[category]


def apply_strategies(name: str, area: str = "", developer: str = "",
                     source: str = "PROPi",
                     category: str = "building") -> tuple[str, list[str]]:
    """Apply all applicable strategies to a name. Returns (canonical, applied_ids)."""
    applied = []
    result = name
    for s in get_strategies(category):
        if not s.applies(result, area, developer, source):
            continue
        before = result
        result = s.transform(result)
        if before != result:
            applied.append(s.id)
    return result, applied


def canonicalize(name: str, area: str = "", developer: str = "",
                 source: str = "PROPi") -> str:
    result, _ = apply_strategies(name, area, developer, source)
    return result


def building_fingerprint(canonical_name: str, developer: str | None,
                         area: str, lat: float | None, lng: float | None) -> str:
    parts = [
        canonicalize(canonical_name, area or "", developer or "").lower().strip(),
        (developer or "").lower().strip(),
        area.lower().strip() if area else "",
        f"{lat:.4f}" if lat else "",
        f"{lng:.4f}" if lng else "",
    ]
    raw = "|".join(parts)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def summarize_strategies() -> list[dict]:
    result = []
    for s in get_strategies():
        result.append(s.to_dict())
    return result


def summarize_knowledge_base() -> dict:
    """Full knowledge base summary including version, stats, and negative knowledge."""
    strategies = get_strategies()
    by_class = {}
    for s in strategies:
        cls = s.classification
        by_class.setdefault(cls, {"count": 0, "auto": 0, "manual": 0, "ids": []})
        by_class[cls]["count"] += 1
        by_class[cls]["ids"].append(s.id)
        if s.auto_apply:
            by_class[cls]["auto"] += 1
        else:
            by_class[cls]["manual"] += 1

    neg_pairs = load_negative_knowledge()
    return {
        "kb_version": KB_VERSION,
        "normalization_strategies": len(strategies),
        "negative_knowledge_pairs": len(neg_pairs),
        "by_classification": by_class,
        "auto_apply": sum(1 for s in strategies if s.auto_apply),
        "requires_review": sum(1 for s in strategies if not s.auto_apply),
    }
