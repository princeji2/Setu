def register_user(name: str, email: str):
    return {
        "message": "User registered successfully",
        "name": name,
        "email": email
    }


def login_user(email: str):
    return {
        "message": "Login successful",
        "email": email
    } 