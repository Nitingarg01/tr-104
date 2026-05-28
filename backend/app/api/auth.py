
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class UserAuth(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(user: UserAuth):
    """Placeholder login endpoint. Returns a fake token."""
    if not user.username or not user.password:
        raise HTTPException(status_code=400, detail="Invalid credentials")
    return {"access_token": "fake-token", "token_type": "bearer"}


@router.post("/signup")
async def signup(user: UserAuth):
    """Placeholder signup endpoint."""
    return {"message": f"User {user.username} registered (placeholder)"}
