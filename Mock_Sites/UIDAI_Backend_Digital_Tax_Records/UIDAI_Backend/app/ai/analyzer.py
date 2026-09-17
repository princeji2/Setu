import re
from datetime import datetime

ALLOWED_INCOME_BRACKETS = {"0-3L", "3-5L", "0-5L", "5-10L", "10-15L", "10L+", "15L+"}
ALLOWED_FILING_STATUSES = {"FILED", "NOT_FILED", "PENDING"}


def analyze_pan_record(
    pan_reference: str,
    full_name: str,
    date_of_birth: str,
    income_bracket: str = "0-5L",
    filing_status: str = "FILED",
    assessment_year: str = "2024-25"
) -> dict:
    """
    AI/Rule-based consistency analyzer for synthetic PAN and tax filing records.
    Evaluates format validity, synthetic compliance, and tax field consistency.
    """
    score = 100
    issues = []
    suggestions = []

    pan_reference = (pan_reference or "").strip()
    full_name = (full_name or "").strip()
    date_of_birth = (date_of_birth or "").strip()
    income_bracket = (income_bracket or "").strip().upper()
    filing_status = (filing_status or "").strip().upper()
    assessment_year = (assessment_year or "").strip()

    # 1. PAN Reference check
    if re.fullmatch(r"[A-Za-z]{5}[0-9]{4}[A-Za-z]", pan_reference):
        score -= 60
        issues.append("Real PAN format detected; real credentials strictly prohibited")
    elif not re.fullmatch(r"(SYNPAN|DEMO)-\d{3,10}", pan_reference):
        score -= 40
        issues.append("PAN reference must be in synthetic format (e.g., SYNPAN-000123 or DEMO-000123)")

    # 2. Name check
    if not full_name:
        score -= 20
        issues.append("Full name is missing")
    elif len(full_name) < 3:
        score -= 10
        issues.append("Full name is too short")
    elif not re.fullmatch(r"[A-Za-z ]+", full_name):
        score -= 15
        issues.append("Full name can contain only letters and spaces")

    # 3. Date of Birth check
    if not date_of_birth:
        score -= 20
        issues.append("Date of birth is missing")
    else:
        try:
            datetime.strptime(date_of_birth, "%Y-%m-%d")
        except ValueError:
            score -= 20
            issues.append("Date of birth must use YYYY-MM-DD format")

    # 4. Filing Status check
    if not filing_status:
        score -= 15
        issues.append("Filing status is missing")
    elif filing_status not in ALLOWED_FILING_STATUSES:
        score -= 20
        issues.append("Filing status must be FILED, NOT_FILED, or PENDING")

    # 5. Income Bracket check
    if not income_bracket:
        score -= 15
        issues.append("Income bracket is missing")
    elif income_bracket not in ALLOWED_INCOME_BRACKETS:
        score -= 15
        issues.append("Income bracket must be a recognized coarse synthetic category (e.g., 0-5L, 5-10L, 10L+)")

    # 6. Assessment Year check
    if not assessment_year:
        score -= 15
        issues.append("Assessment year is missing")
    elif not re.fullmatch(r"(?:19|20)\d{2}-(?:(?:\d{2})|(?:\d{4}))", assessment_year):
        score -= 15
        issues.append("Assessment year format must be plausible (e.g., 2024-25)")

    final_score = max(score, 0)

    if final_score >= 90:
        risk_level = "LOW"
        suggestions.append("PAN record data is consistent and valid")
    elif final_score >= 60:
        risk_level = "MEDIUM"
        suggestions.append("Review submitted PAN record and tax filing details")
    else:
        risk_level = "HIGH"
        suggestions.append("Correct the submitted synthetic PAN information")

    return {
        "score": final_score,
        "risk_level": risk_level,
        "issues": issues,
        "suggestions": suggestions
    }


# Backwards compatibility alias
analyze_verification = analyze_pan_record