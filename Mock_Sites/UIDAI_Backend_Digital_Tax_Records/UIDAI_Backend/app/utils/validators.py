import re

REAL_PAN_REGEX = re.compile(r"^[A-Za-z]{5}[0-9]{4}[A-Za-z]$")
SYNTHETIC_PAN_REGEX = re.compile(r"^(SYNPAN|DEMO)-\d{3,10}$")

def is_real_pan(identifier: str) -> bool:
    """Returns True if identifier matches the Indian Income Tax PAN format (AAAAA9999A)."""
    return bool(REAL_PAN_REGEX.fullmatch(identifier.strip()))

def is_synthetic_pan(identifier: str) -> bool:
    """Returns True if identifier strictly follows synthetic format (SYNPAN-XXXX or DEMO-XXXX)."""
    return bool(SYNTHETIC_PAN_REGEX.fullmatch(identifier.strip()))

def validate_pan_identifier(identifier: str) -> tuple[bool, str]:
    identifier = identifier.strip()
    if is_real_pan(identifier):
        return False, "Real PAN numbers are strictly prohibited. Please use a synthetic demo reference (e.g., SYNPAN-000123 or DEMO-000123)."
    if not is_synthetic_pan(identifier):
        return False, "Invalid synthetic PAN format. Reference must start with 'SYNPAN-' or 'DEMO-' followed by digits (e.g., SYNPAN-000123)."
    return True, "Valid synthetic identifier"
