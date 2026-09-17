import re
from datetime import datetime, timezone


def validate_pan_reference(pan_reference: str) -> tuple[bool, str]:
    """
    Validates synthetic PAN reference. Strictly rejects real PAN formats (AAAAA9999A).
    Only accepts synthetic formats starting with SYNPAN- or DEMO- followed by digits.
    """
    pan_reference = pan_reference.strip()

    # Reject real PAN format (5 uppercase letters, 4 digits, 1 uppercase letter)
    if re.fullmatch(r"[A-Za-z]{5}[0-9]{4}[A-Za-z]", pan_reference):
        return (
            False,
            "Real PAN numbers are strictly prohibited. Please use a synthetic demo reference (e.g., SYNPAN-000123 or DEMO-000123)."
        )

    # Require synthetic format starting with SYNPAN- or DEMO- followed by digits
    if not re.fullmatch(r"(SYNPAN|DEMO)-\d{3,10}", pan_reference):
        return (
            False,
            "Invalid synthetic PAN format. Reference must start with 'SYNPAN-' or 'DEMO-' followed by digits (e.g., SYNPAN-000123)."
        )

    return True, "Valid synthetic PAN reference"


def mask_pan_reference(pan_reference: str) -> str:
    """
    Masks synthetic PAN reference for display (e.g., SYNPAN-000123 -> SYNPAN-***123).
    """
    pan_reference = pan_reference.strip()
    parts = pan_reference.split("-", 1)
    if len(parts) == 2:
        prefix, digits = parts
        if len(digits) > 3:
            masked_digits = "*" * (len(digits) - 3) + digits[-3:]
            return f"{prefix}-{masked_digits}"
    return pan_reference


def perform_demo_pan_verification(
    pan_reference: str,
    full_name: str,
    date_of_birth: str,
    income_bracket: str = "0-5L",
    filing_status: str = "FILED",
    assessment_year: str = "2024-25"
) -> dict:
    """
    Performs demo verification on synthetic PAN tax record parameters.
    """
    pan_reference = pan_reference.strip()
    full_name = full_name.strip()
    date_of_birth = date_of_birth.strip()

    is_valid_ref, ref_msg = validate_pan_reference(pan_reference)
    if not is_valid_ref:
        return {
            "status": "FAILED",
            "message": ref_msg
        }

    if not full_name:
        return {
            "status": "FAILED",
            "message": "Full name cannot be empty"
        }

    if not date_of_birth:
        return {
            "status": "FAILED",
            "message": "Date of birth cannot be empty"
        }

    return {
        "status": "VERIFIED",
        "message": "Demo PAN record verification successful",
        "pan_reference": pan_reference,
        "masked_pan": mask_pan_reference(pan_reference),
        "verified_at": datetime.now(timezone.utc)
    }
