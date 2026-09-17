from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models.pan import PanRecord
from app.schemas.pan_schema import PanRecordCreate, GatewayFieldItem, GatewayFieldsData
from app.pan_verification import perform_demo_pan_verification
from app.ai.analyzer import analyze_pan_record
from app.config.settings import DEPARTMENT_NAME


def register_pan_record(
    db: Session,
    user_id: int,
    pan_data: PanRecordCreate
) -> tuple[Optional[PanRecord], Optional[str], int]:
    """
    Registers and verifies a synthetic PAN record for a user.
    Returns (record, error_message, status_code).
    """
    # Run synthetic demo verification
    verification_res = perform_demo_pan_verification(
        pan_reference=pan_data.pan_reference,
        full_name=pan_data.full_name,
        date_of_birth=pan_data.date_of_birth,
        income_bracket=pan_data.income_bracket,
        filing_status=pan_data.filing_status,
        assessment_year=pan_data.assessment_year
    )

    if verification_res["status"] == "FAILED":
        return None, verification_res["message"], 400

    # Run AI analyzer
    ai_res = analyze_pan_record(
        pan_reference=pan_data.pan_reference,
        full_name=pan_data.full_name,
        date_of_birth=pan_data.date_of_birth,
        income_bracket=pan_data.income_bracket,
        filing_status=pan_data.filing_status,
        assessment_year=pan_data.assessment_year
    )

    # Check for existing record for this user
    existing = db.query(PanRecord).filter(
        PanRecord.user_id == user_id,
        PanRecord.pan_reference == pan_data.pan_reference
    ).first()

    if existing:
        return None, "This PAN record is already registered for this user", 409

    new_record = PanRecord(
        user_id=user_id,
        pan_reference=pan_data.pan_reference,
        full_name=pan_data.full_name,
        date_of_birth=pan_data.date_of_birth,
        income_bracket=pan_data.income_bracket,
        filing_status=pan_data.filing_status,
        assessment_year=pan_data.assessment_year,
        status=verification_res["status"],
        message=verification_res["message"],
        ai_score=ai_res["score"],
        risk_level=ai_res["risk_level"]
    )

    db.add(new_record)
    db.commit()
    db.refresh(new_record)

    return new_record, None, 200


def get_user_pan_records(db: Session, user_id: int) -> List[PanRecord]:
    return db.query(PanRecord).filter(
        PanRecord.user_id == user_id
    ).order_by(PanRecord.id.desc()).all()


def get_pan_record_by_id(db: Session, record_id: int, user_id: int) -> Optional[PanRecord]:
    return db.query(PanRecord).filter(
        PanRecord.id == record_id,
        PanRecord.user_id == user_id
    ).first()


def get_gateway_fields_by_reference(db: Session, pan_reference: str) -> Optional[GatewayFieldsData]:
    record = db.query(PanRecord).filter(
        PanRecord.pan_reference == pan_reference
    ).first()

    if not record:
        return None

    last_updated = (
        record.created_at.isoformat()
        if record.created_at
        else datetime.now(timezone.utc).isoformat()
    )

    fields = [
        GatewayFieldItem(
            name="fullName",
            value=record.full_name,
            verified=True,
            lastUpdated=last_updated
        ),
        GatewayFieldItem(
            name="filingStatus",
            value=record.filing_status,
            verified=True,
            lastUpdated=last_updated
        ),
        GatewayFieldItem(
            name="incomeBracket",
            value=record.income_bracket,
            verified=True,
            lastUpdated=last_updated
        ),
        GatewayFieldItem(
            name="assessmentYear",
            value=record.assessment_year,
            verified=True,
            lastUpdated=last_updated
        )
    ]

    return GatewayFieldsData(
        reference=record.pan_reference,
        fields=fields,
        sourceDepartment=DEPARTMENT_NAME
    )
