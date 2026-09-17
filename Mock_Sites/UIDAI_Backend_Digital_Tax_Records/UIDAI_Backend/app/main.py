import re
from typing import Optional, List
from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    Request
)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.database import (
    Base,
    engine,
    get_db
)
from app.config.settings import (
    GATEWAY_ORIGINS,
    DEPARTMENT_NAME
)
from app.models.user import User
from app.models.pan import PanRecord
from app.schemas.user_schema import (
    UserCreate,
    LoginRequest,
    UserResponse,
    ProfileUpdate
)
from app.schemas.pan_schema import (
    PanRecordCreate,
    PanRecordResponse
)
from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user
)
from app.routes.pan import router as pan_router


# =========================================================
# CREATE DATABASE TABLES
# =========================================================

Base.metadata.create_all(bind=engine)


# =========================================================
# FASTAPI APPLICATION
# =========================================================

app = FastAPI(
    title="PAN Records Service",
    description="Synthetic PAN and income-tax record verification for demo purposes",
    version="1.0.0"
)


# =========================================================
# CORS MIDDLEWARE
# =========================================================

default_local_origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8000",
    "http://localhost:5000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:5000",
]

cors_origins = list(set(default_local_origins + GATEWAY_ORIGINS))

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# GLOBAL VALIDATION ERROR HANDLER
# =========================================================

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError
):
    errors = []
    for error in exc.errors():
        field = ".".join(str(loc) for loc in error["loc"])
        errors.append({"field": field, "message": error["msg"]})

    first_message = errors[0]["message"] if errors else "Invalid request data"

    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "data": None,
            "error": first_message,
            "details": errors
        }
    )


# =========================================================
# GLOBAL HTTP ERROR HANDLER
# =========================================================

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "data": None,
            "error": str(exc.detail)
        }
    )


# =========================================================
# GLOBAL SERVER ERROR HANDLER
# =========================================================

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "data": None,
            "error": "Internal Server Error"
        }
    )


# =========================================================
# INCLUDE ROUTERS
# =========================================================

app.include_router(pan_router)


# =========================================================
# HELPERS
# =========================================================

def _user_profile_dict(user: User) -> dict:
    """Serialize a User object to a profile response dict (no password)."""
    dob = None
    if user.date_of_birth:
        dob = (
            user.date_of_birth.isoformat()
            if hasattr(user.date_of_birth, "isoformat")
            else str(user.date_of_birth)
        )
    created = None
    if user.created_at:
        created = (
            user.created_at.isoformat()
            if hasattr(user.created_at, "isoformat")
            else str(user.created_at)
        )
    return {
        "id": user.id,
        "full_name": user.name,
        "email": user.email,
        "mobile_number": user.phone,
        "date_of_birth": dob,
        "family_income": user.family_income,
        "income_source": user.income_source,
        "is_active": user.is_active,
        "created_at": created
    }


# =========================================================
# ROOT ENDPOINT
# =========================================================

@app.get("/")
def root():
    return {
        "success": True,
        "data": {
            "service": "PAN Records Service",
            "department": DEPARTMENT_NAME,
            "message": "PAN Records Service is running",
            "version": "1.0.0"
        },
        "error": None
    }


# =========================================================
# REGISTER
# =========================================================

@app.post("/auth/register")
def register(
    user: UserCreate,
    db: Session = Depends(get_db)
):
    # Check duplicate email
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Resolve the phone to check: use mobile_number (already validated/normalised)
    resolved_phone = user.mobile_number or user.phone
    if db.query(User).filter(User.phone == resolved_phone).first():
        raise HTTPException(
            status_code=400,
            detail="Phone number already registered"
        )

    new_user = User(
        name=user.full_name,                     # DB column is "name"
        email=user.email,
        phone=resolved_phone,                    # DB column is "phone"
        date_of_birth=user.date_of_birth,
        family_income=user.family_income,
        income_source=user.income_source,
        password=hash_password(user.password)
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "success": True,
        "data": {
            "user_id": new_user.id,
            "message": "User registered successfully"
        },
        "error": None
    }


# =========================================================
# LOGIN
# =========================================================

@app.post("/auth/login")
def login(
    login_data: LoginRequest,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == login_data.email).first()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    if not verify_password(login_data.password, user.password):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="User account is inactive"
        )

    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email}
    )

    return {
        "success": True,
        "data": {
            "access_token": access_token,
            "token_type": "bearer",
            "message": "Login successful"
        },
        "error": None
    }


# =========================================================
# AUTH/ME  (legacy – kept for backward compat)
# =========================================================

@app.get("/auth/me")
def get_auth_me(
    current_user: User = Depends(get_current_user)
):
    return {
        "success": True,
        "data": _user_profile_dict(current_user),
        "error": None
    }


# =========================================================
# GET /users/me  — authenticated user's own profile
# =========================================================

@app.get("/users/me")
def get_my_profile(
    current_user: User = Depends(get_current_user)
):
    return {
        "success": True,
        "data": _user_profile_dict(current_user),
        "error": None
    }


# =========================================================
# PATCH /users/me  — update authenticated user's own profile
# =========================================================

@app.patch("/users/me")
def update_my_profile(
    updates: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Reload the user inside this session to ensure it's attached
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if updates.full_name is not None:
        user.name = updates.full_name

    if updates.mobile_number is not None:
        # Check uniqueness — reject if another user already has this number
        conflict = db.query(User).filter(
            User.phone == updates.mobile_number,
            User.id != user.id
        ).first()
        if conflict:
            raise HTTPException(
                status_code=400,
                detail="Phone number already registered by another user"
            )
        user.phone = updates.mobile_number

    if updates.date_of_birth is not None:
        user.date_of_birth = updates.date_of_birth

    if updates.family_income is not None:
        user.family_income = updates.family_income

    if updates.income_source is not None:
        user.income_source = updates.income_source

    db.commit()
    db.refresh(user)

    return {
        "success": True,
        "data": _user_profile_dict(user),
        "error": None
    }


# =========================================================
# GET ALL USERS  (admin / debug)
# =========================================================

@app.get("/users/")
def get_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return {
        "success": True,
        "data": [_user_profile_dict(u) for u in users],
        "error": None
    }


# =========================================================
# GET SINGLE USER BY ID  (admin / debug)
# =========================================================

@app.get("/users/{user_id}")
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "success": True,
        "data": _user_profile_dict(user),
        "error": None
    }


# =========================================================
# UPDATE USER BY ID  (admin)
# =========================================================

@app.put("/users/{user_id}")
def update_user(
    user_id: int,
    user_data: UserCreate,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    resolved_phone = user_data.mobile_number or user_data.phone

    user.name = user_data.full_name
    user.email = user_data.email
    user.phone = resolved_phone
    if user_data.date_of_birth:
        user.date_of_birth = user_data.date_of_birth
    if user_data.family_income:
        user.family_income = user_data.family_income
    if user_data.income_source:
        user.income_source = user_data.income_source
    user.password = hash_password(user_data.password)

    db.commit()
    db.refresh(user)

    return {
        "success": True,
        "data": _user_profile_dict(user),
        "error": None
    }


# =========================================================
# DELETE USER  (admin)
# =========================================================

@app.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(user)
    db.commit()

    return {
        "success": True,
        "data": {"message": "User deleted successfully"},
        "error": None
    }
