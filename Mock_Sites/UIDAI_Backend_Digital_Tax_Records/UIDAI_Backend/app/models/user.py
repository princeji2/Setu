from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    Date,
    DateTime
)
from sqlalchemy.sql import func

from app.database import Base


class User(Base):
    __tablename__ = "users"

    # Primary key
    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    # -----------------------------
    # Personal Information
    # DB column is "name" for backward-compat;
    # API exposes it as "full_name"
    # -----------------------------

    name = Column(
        String(100),
        nullable=False
    )

    email = Column(
        String(255),
        unique=True,
        index=True,
        nullable=False
    )

    # DB column is "phone" for backward-compat;
    # API exposes it as "mobile_number"
    phone = Column(
        String(10),
        unique=True,
        nullable=False
    )

    date_of_birth = Column(
        Date,
        nullable=True          # nullable so existing users aren't broken
    )

    # -----------------------------
    # Financial Information
    # -----------------------------

    family_income = Column(
        String(50),
        nullable=True          # nullable so existing users aren't broken
    )

    income_source = Column(
        String(100),
        nullable=True          # nullable so existing users aren't broken
    )

    # -----------------------------
    # Authentication
    # -----------------------------

    password = Column(
        String,
        nullable=False
    )

    # -----------------------------
    # Account Information
    # -----------------------------

    created_at = Column(
        DateTime,
        server_default=func.now()
    )

    is_active = Column(
        Boolean,
        default=True
    )

    # ------------------------------------------------------------------
    # Convenience properties so code can use user.full_name /
    # user.mobile_number without touching the DB column name
    # ------------------------------------------------------------------

    @property
    def full_name(self) -> str:
        return self.name

    @full_name.setter
    def full_name(self, value: str):
        self.name = value

    @property
    def mobile_number(self) -> str:
        return self.phone

    @mobile_number.setter
    def mobile_number(self, value: str):
        self.phone = value
