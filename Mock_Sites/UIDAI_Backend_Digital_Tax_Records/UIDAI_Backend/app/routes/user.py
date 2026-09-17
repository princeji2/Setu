from fastapi import APIRouter

router = APIRouter(
    prefix="/users",
    tags=["Users"]
)

@router.get("/")
def get_users():
    return {
        "message": "Users API working"
    }

@router.get("/{user_id}")
def get_user(user_id: int):
    return {
        "user_id": user_id,
        "message": "User found"
    } 