import re
from datetime import date
from typing import Optional
from pydantic import (
    BaseModel,
    EmailStr,
    Field,
    field_validator,
    model_validator,
    ConfigDict
)

# =========================================================
# ALLOWED VALUES
# =========================================================

ALLOWED_INCOME = {
    "0-3L",
    "3-5L",
    "0-5L",
    "5-10L",
    "10-15L",
    "10L+",
    "15L+"
}

ALLOWED_INCOME_SOURCES = {
    "SALARY",
    "BUSINESS",
    "SELF_EMPLOYED",
    "AGRICULTURE",
    "PROFESSIONAL",
    "INVESTMENTS",
    "PENSION",
    "OTHER"
}

# =========================================================
# SHARED VALIDATORS
# =========================================================

def validate_full_name(value: str) -> str:
    value = value.strip()
    if len(value) < 2:
        raise ValueError("Full name must contain at least 2 characters")
    if len(value) > 100:
        raise ValueError("Full name cannot exceed 100 characters")
    if not re.fullmatch(r"[A-Za-z ]+", value):
        raise ValueError("Full name can contain only letters and spaces")
    return value


def validate_mobile_number(value: str) -> str:
    value = value.strip()
    if not re.fullmatch(r"[6-9][0-9]{9}", value):
        raise ValueError(
            "Mobile number must be 10 digits and start with 6-9"
        )
    return value


def validate_password(value: str) -> str:
    if len(value) < 8:
        raise ValueError("Password must contain at least 8 characters")
    if not re.search(r"[A-Z]", value):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", value):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r"[0-9]", value):
        raise ValueError("Password must contain at least one number")
    return value


def validate_family_income(value: str) -> str:
    value = value.strip().upper()
    if value not in ALLOWED_INCOME:
        raise ValueError(
            f"Family income must be one of: {', '.join(sorted(ALLOWED_INCOME))}"
        )
    return value


def validate_income_source(value: str) -> str:
    value = value.strip().upper()
    if value not in ALLOWED_INCOME_SOURCES:
        raise ValueError(
            f"Income source must be one of: {', '.join(sorted(ALLOWED_INCOME_SOURCES))}"
        )
    return value


def validate_date_of_birth(value: date) -> date:
    today = date.today()
    if value >= today:
        raise ValueError("Date of birth must be in the past")
    return value


# =========================================================
# USER CREATE  (registration)
# =========================================================

class UserCreate(BaseModel):
    """
    Accepts both modern field names (full_name / mobile_number)
    and legacy names (name / phone) for backward compatibility.
    """

    # Modern names (preferred)
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    mobile_number: Optional[str] = None

    # Legacy aliases kept for existing clients
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    phone: Optional[str] = None

    email: EmailStr

    date_of_birth: Optional[date] = None

    family_income: Optional[str] = None

    income_source: Optional[str] = None

    password: str

    # ----------------------------------------------------------
    # Cross-field normalisation: merge legacy → modern
    # ----------------------------------------------------------
    @model_validator(mode="after")
    def resolve_name_and_phone(self):
        # Resolve full_name: prefer explicit full_name, fall back to name
        resolved_name = self.full_name or self.name
        if not resolved_name:
            raise ValueError("full_name (or name) is required")
        self.full_name = validate_full_name(resolved_name)
        self.name = self.full_name   # keep in sync

        # Resolve mobile_number: prefer mobile_number, fall back to phone
        resolved_phone = self.mobile_number or self.phone
        if not resolved_phone:
            raise ValueError("mobile_number (or phone) is required")
        self.mobile_number = validate_mobile_number(resolved_phone)
        self.phone = self.mobile_number  # keep in sync

        return self

    @field_validator("date_of_birth")
    @classmethod
    def check_date(cls, value):
        if value is not None:
            return validate_date_of_birth(value)
        return value

    @field_validator("family_income")
    @classmethod
    def check_family_income(cls, value):
        if value is not None:
            return validate_family_income(value)
        return value

    @field_validator("income_source")
    @classmethod
    def check_income_source(cls, value):
        if value is not None:
            return validate_income_source(value)
        return value

    @field_validator("password")
    @classmethod
    def check_password(cls, value):
        return validate_password(value)


# =========================================================
# LOGIN
# =========================================================

class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


# =========================================================
# USER RESPONSE  (never exposes password)
# =========================================================

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str = Field(alias="name")     # DB col is "name"
    email: str
    mobile_number: str = Field(alias="phone") # DB col is "phone"
    date_of_birth: Optional[date] = None
    family_income: Optional[str] = None
    income_source: Optional[str] = None
    is_active: bool
    created_at: Optional[str] = None         # serialised as ISO string

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True    # allow both alias and field name
    )


# =========================================================
# PROFILE UPDATE  (PATCH /users/me)
# All fields optional — only supplied fields are changed
# =========================================================

class ProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    mobile_number: Optional[str] = None
    date_of_birth: Optional[date] = None
    family_income: Optional[str] = None
    income_source: Optional[str] = None

    @field_validator("full_name")
    @classmethod
    def check_full_name(cls, value):
        if value is not None:
            return validate_full_name(value)
        return value

    @field_validator("mobile_number")
    @classmethod
    def check_mobile_number(cls, value):
        if value is not None:
            return validate_mobile_number(value)
        return value

    @field_validator("date_of_birth")
    @classmethod
    def check_date(cls, value):
        if value is not None:
            return validate_date_of_birth(value)
        return value

    @field_validator("family_income")
    @classmethod
    def check_family_income(cls, value):
        if value is not None:
            return validate_family_income(value)
        return value

    @field_validator("income_source")
    @classmethod
    def check_income_source(cls, value):
        if value is not None:
            return validate_income_source(value)
        return value
