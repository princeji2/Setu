from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func

from app.database import Base


class PanRecord(Base):
    """
    Synthetic PAN and income-tax filing record model.
    All data stored is synthetic for demo/interoperability testing.
    """
    __tablename__ = "pan_records"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    user_id = Column(
        Integer,
        nullable=False,
        index=True
    )

    pan_reference = Column(
        String,
        nullable=False,
        index=True
    )

    full_name = Column(
        String,
        nullable=False
    )

    date_of_birth = Column(
        String,
        nullable=False
    )

    income_bracket = Column(
        String,
        nullable=False
    )

    filing_status = Column(
        String,
        nullable=False
    )

    assessment_year = Column(
        String,
        nullable=False
    )

    status = Column(
        String,
        nullable=False
    )

    message = Column(
        String,
        nullable=False
    )

    ai_score = Column(
        Integer,
        nullable=False
    )

    risk_level = Column(
        String,
        nullable=False
    )

    created_at = Column(
        DateTime,
        server_default=func.now()
    )
