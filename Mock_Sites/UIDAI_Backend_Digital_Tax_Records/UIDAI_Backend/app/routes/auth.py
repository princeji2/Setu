from fastapi import APIRouter
from app.services.auth_service import register_user, login_user

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)

@router.post("/register")
def register(name: str, email: str):
    return register_user(name, email)


@router.post("/login")
def login(email: str):
    return login_user(email) 