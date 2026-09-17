import re
from typing import Generic, TypeVar, Optional, List, Any
from datetime import datetime
from pydantic import BaseModel, Field, field_validator, ConfigDict

T = TypeVar("T")

ALLOWED_INCOME_BRACKETS = {"0-3L", "3-5L", "0-5L", "5-10L", "10-15L", "10L+", "15L+"}
ALLOWED_FILING_STATUSES = {"FILED", "NOT_FILED", "PENDING"}


class StandardResponse(BaseModel, Generic[T]):
    success: bool
    data: Optional[T] = None
    error: Optional[str] = None


class PanRecordCreate(BaseModel):
    pan_reference: str
    full_name: str = Field(min_length=2, max_length=100)
    date_of_birth: str
    income_bracket: str
    filing_status: str
    assessment_year: str

    @field_validator("pan_reference")
    @classmethod
    def check_pan_reference(cls, value: str) -> str:
        value = value.strip()
        # Strictly reject real PAN pattern (5 uppercase letters, 4 digits, 1 uppercase letter)
        if re.fullmatch(r"[A-Za-z]{5}[0-9]{4}[A-Za-z]", value):
            raise ValueError(
                "Real PAN numbers are strictly prohibited. Please use a synthetic demo reference (e.g., SYNPAN-000123 or DEMO-000123)."
            )
        # Require synthetic format starting with SYNPAN- or DEMO- followed by digits
        if not re.fullmatch(r"(SYNPAN|DEMO)-\d{3,10}", value):
            raise ValueError(
                "Invalid synthetic PAN format. Reference must start with 'SYNPAN-' or 'DEMO-' followed by digits (e.g., SYNPAN-000123)."
            )
        return value

    @field_validator("full_name")
    @classmethod
    def check_full_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Full name must contain at least 2 characters")
        if len(value) > 100:
            raise ValueError("Full name cannot exceed 100 characters")
        if not re.fullmatch(r"[A-Za-z ]+", value):
            raise ValueError("Full name can contain only letters and spaces")
        return value

    @field_validator("date_of_birth")
    @classmethod
    def check_date_of_birth(cls, value: str) -> str:
        value = value.strip()
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise ValueError("Date of birth must use YYYY-MM-DD format")
        try:
            datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            raise ValueError("Invalid calendar date in date of birth")
        return value

    @field_validator("income_bracket")
    @classmethod
    def check_income_bracket(cls, value: str) -> str:
        value = value.strip().upper()
        if value not in ALLOWED_INCOME_BRACKETS:
            raise ValueError(
                f"Income bracket must be a coarse synthetic category: {', '.join(sorted(ALLOWED_INCOME_BRACKETS))}"
            )
        return value

    @field_validator("filing_status")
    @classmethod
    def check_filing_status(cls, value: str) -> str:
        value = value.strip().upper()
        if value not in ALLOWED_FILING_STATUSES:
            raise ValueError(
                f"Filing status must be one of: {', '.join(sorted(ALLOWED_FILING_STATUSES))}"
            )
        return value

    @field_validator("assessment_year")
    @classmethod
    def check_assessment_year(cls, value: str) -> str:
        value = value.strip()
        if not re.fullmatch(r"(?:19|20)\d{2}-(?:(?:\d{2})|(?:\d{4}))", value):
            raise ValueError("Assessment year must use YYYY-YY or YYYY-YYYY format (e.g., 2024-25)")
        return value


class PanRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    pan_reference: str
    full_name: str
    date_of_birth: str
    income_bracket: str
    filing_status: str
    assessment_year: str
    status: str
    message: str
    ai_score: int
    risk_level: str
    created_at: Optional[Any] = None


class GatewayFieldItem(BaseModel):
    name: str
    value: str
    verified: bool = True
    lastUpdated: str


class GatewayFieldsData(BaseModel):
    reference: str
    fields: List[GatewayFieldItem]
    sourceDepartment: str = "Digital Tax Records — Demo Department"


class GatewayFieldsResponse(BaseModel):
    success: bool = True
    data: GatewayFieldsData
    error: Optional[str] = None
