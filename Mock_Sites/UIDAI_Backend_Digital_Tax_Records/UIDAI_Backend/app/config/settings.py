import os
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "demo-tax-records-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

DEPARTMENT_NAME = "Digital Tax Records — Demo Department"

GATEWAY_API_KEY = os.getenv("GATEWAY_API_KEY", "setu-demo-gateway-key-dtr-2026")

_raw_origins = os.getenv(
    "GATEWAY_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://localhost:8080,http://localhost:5000"
)
GATEWAY_ORIGINS = [
    origin.strip()
    for origin in _raw_origins.split(",")
    if origin.strip()
]

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./pan_records.db")