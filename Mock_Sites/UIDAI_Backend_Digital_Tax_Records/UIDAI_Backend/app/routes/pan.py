import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user
from app.models.user import User
from app.schemas.pan_schema import (
    PanRecordCreate,
    GatewayFieldsResponse,
    StandardResponse
)
from app.services.pan_service import (
    register_pan_record,
    get_user_pan_records,
    get_pan_record_by_id,
    get_gateway_fields_by_reference
)
from app.config.settings import GATEWAY_API_KEY, DEPARTMENT_NAME

router = APIRouter(prefix="/pan", tags=["PAN Records"])


def verify_gateway_key(x_gateway_key: Optional[str] = Header(None, alias="X-Gateway-Key")):
    if not x_gateway_key:
        raise HTTPException(
            status_code=401,
            detail="Access denied: Missing X-Gateway-Key header for gateway service authentication."
        )
    if x_gateway_key != GATEWAY_API_KEY:
        raise HTTPException(
            status_code=401,
            detail="Access denied: Invalid X-Gateway-Key provided."
        )
    return x_gateway_key


@router.get("/{pan_reference}/fields")
def get_pan_fields_for_gateway(
    pan_reference: str,
    gateway_key: str = Depends(verify_gateway_key),
    db: Session = Depends(get_db)
):
    pan_reference = pan_reference.strip()

    # Reject real PAN format
    if re.fullmatch(r"[A-Za-z]{5}[0-9]{4}[A-Za-z]", pan_reference):
        raise HTTPException(
            status_code=400,
            detail="Validation failed: Real PAN numbers are strictly forbidden. Please use synthetic test identifiers (e.g., SYNPAN-000123)."
        )

    # Require synthetic format
    if not re.fullmatch(r"(SYNPAN|DEMO)-\d{3,10}", pan_reference):
        raise HTTPException(
            status_code=400,
            detail="Validation failed: Identifier must be a synthetic reference starting with 'SYNPAN-' or 'DEMO-' followed by digits."
        )

    gateway_data = get_gateway_fields_by_reference(db, pan_reference)
    if not gateway_data:
        raise HTTPException(
            status_code=404,
            detail=f"PAN record '{pan_reference}' not found in tax records database."
        )

    return {
        "success": True,
        "data": gateway_data.model_dump(),
        "error": None
    }


@router.post("/")
def create_pan_record(
    pan_data: PanRecordCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    record, err_msg, status_code = register_pan_record(db, current_user.id, pan_data)
    if err_msg:
        raise HTTPException(
            status_code=status_code,
            detail=err_msg
        )

    return {
        "success": True,
        "data": {
            "id": record.id,
            "user_id": record.user_id,
            "pan_reference": record.pan_reference,
            "full_name": record.full_name,
            "date_of_birth": record.date_of_birth,
            "income_bracket": record.income_bracket,
            "filing_status": record.filing_status,
            "assessment_year": record.assessment_year,
            "status": record.status,
            "message": record.message,
            "ai_score": record.ai_score,
            "risk_level": record.risk_level,
            "created_at": record.created_at.isoformat() if record.created_at else None
        },
        "error": None
    }


@router.get("/")
def list_my_pan_records(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    records = get_user_pan_records(db, current_user.id)
    return {
        "success": True,
        "data": [
            {
                "id": rec.id,
                "user_id": rec.user_id,
                "pan_reference": rec.pan_reference,
                "full_name": rec.full_name,
                "date_of_birth": rec.date_of_birth,
                "income_bracket": rec.income_bracket,
                "filing_status": rec.filing_status,
                "assessment_year": rec.assessment_year,
                "status": rec.status,
                "message": rec.message,
                "ai_score": rec.ai_score,
                "risk_level": rec.risk_level,
                "created_at": rec.created_at.isoformat() if rec.created_at else None
            }
            for rec in records
        ],
        "error": None
    }


@router.get("/{record_id}")
def get_single_pan_record(
    record_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    record = get_pan_record_by_id(db, record_id, current_user.id)
    if not record:
        raise HTTPException(
            status_code=404,
            detail="PAN record not found"
        )

    return {
        "success": True,
        "data": {
            "id": record.id,
            "user_id": record.user_id,
            "pan_reference": record.pan_reference,
            "full_name": record.full_name,
            "date_of_birth": record.date_of_birth,
            "income_bracket": record.income_bracket,
            "filing_status": record.filing_status,
            "assessment_year": record.assessment_year,
            "status": record.status,
            "message": record.message,
            "ai_score": record.ai_score,
            "risk_level": record.risk_level,
            "created_at": record.created_at.isoformat() if record.created_at else None
        },
        "error": None
    }
