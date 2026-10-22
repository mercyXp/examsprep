from fastapi import APIRouter, Depends, HTTPException, status

from app.access import AccessScope, staff_scope
from app.emailer import send_test_email

router = APIRouter(tags=["mail"])


@router.post("/api/admin/email/test")
def send_admin_test_email(scope: AccessScope = Depends(staff_scope)) -> dict[str, object]:
    if not scope.super_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a super administrator can send a test email.")
    if not send_test_email(scope.user.email):
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Email isn’t configured, or the provider rejected the message.",
        )
    return {"ok": True, "message": "Test email sent to your sign-in address."}
