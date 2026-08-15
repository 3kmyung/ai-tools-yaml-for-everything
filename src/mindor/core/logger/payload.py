from typing import Type, Union, Literal, Optional, Dict, List, Tuple, Set, Annotated, Callable, Any

MAX_STRING_CHARS: int = 200
MAX_SEQUENCE_ITEMS: int = 10
MAX_MAPPING_ITEMS: int = 20
MAX_TOTAL_CHARS: int = 800
MAX_DEPTH: int = 6

_SIZE_UNITS: Tuple[str, ...] = ( "KB", "MB", "GB", "TB" )

class LoggablePayload:
    def __init__(self, value: Any):
        self.value: Any = value

    def __str__(self) -> str:
        return _truncate(_format_value(self.value, MAX_DEPTH, _Budget(MAX_TOTAL_CHARS)), MAX_TOTAL_CHARS)

    def __repr__(self) -> str:
        return self.__str__()

def loggable(value: Any) -> LoggablePayload:
    return LoggablePayload(value)

class _Budget:
    def __init__(self, limit: int):
        self.remaining: int = limit

    def spend(self, rendered: str) -> str:
        self.remaining -= len(rendered)

        return rendered

    def exhausted(self) -> bool:
        return self.remaining <= 0

def _format_value(value: Any, depth: int, budget: _Budget) -> str:
    if isinstance(value, (bytes, bytearray, memoryview)):
        return budget.spend(f"<{type(value).__name__} {_format_size(len(value))}>")

    if isinstance(value, str):
        return budget.spend(_format_string(value))

    if value is None or isinstance(value, (bool, int, float)):
        return budget.spend(repr(value))

    if depth <= 0 or budget.exhausted():
        return budget.spend("...")

    if isinstance(value, dict):
        return _format_mapping(value, depth, budget)

    if isinstance(value, (list, tuple, set, frozenset)):
        return _format_sequence(value, depth, budget)

    return budget.spend(_truncate(repr(value), MAX_STRING_CHARS))

def _format_mapping(value: Dict[Any, Any], depth: int, budget: _Budget) -> str:
    items: List[str] = []

    for key, item in list(value.items())[:MAX_MAPPING_ITEMS]:
        if budget.exhausted():
            break
        items.append(f"{_format_key(key, budget)}: {_format_value(item, depth - 1, budget)}")

    remainder = len(value) - len(items)

    if remainder > 0:
        items.append(budget.spend(f"... (+{remainder} more)"))

    return "{" + ", ".join(items) + "}"

def _format_sequence(value: Union[List[Any], Tuple[Any, ...], Set[Any], frozenset], depth: int, budget: _Budget) -> str:
    items: List[str] = []

    for item in list(value)[:MAX_SEQUENCE_ITEMS]:
        if budget.exhausted():
            break
        items.append(_format_value(item, depth - 1, budget))

    remainder = len(value) - len(items)

    if remainder > 0:
        items.append(budget.spend(f"... (+{remainder} more)"))

    open_bracket, close_bracket = ("[", "]") if isinstance(value, list) else ("(", ")") if isinstance(value, tuple) else ("{", "}")

    return open_bracket + ", ".join(items) + close_bracket

def _format_key(key: Any, budget: _Budget) -> str:
    return budget.spend(_format_string(key) if isinstance(key, str) else _truncate(repr(key), MAX_STRING_CHARS))

def _format_string(value: str) -> str:
    if len(value) <= MAX_STRING_CHARS:
        return repr(value)

    return f"{repr(value[:MAX_STRING_CHARS])}... (+{len(value) - MAX_STRING_CHARS} chars)"

def _truncate(rendered: str, limit: int) -> str:
    if len(rendered) <= limit:
        return rendered

    return f"{rendered[:limit]}... (+{len(rendered) - limit} chars)"

def _format_size(size: int) -> str:
    if size < 1024:
        return f"{size} bytes"

    scaled = float(size)
    for unit in _SIZE_UNITS:
        scaled /= 1024.0
        if scaled < 1024.0 or unit == _SIZE_UNITS[-1]:
            return f"{scaled:.1f} {unit}"

    return f"{size} bytes"
