"""
M Bee Enterprises – FastAPI & Supabase Backend (Python)
Proprietors: Baljinder Singh & Manpreet Singh (ਬਲਜਿੰਦਰ ਸਿੰਘ ਅਤੇ ਮਨਪ੍ਰੀਤ ਸਿੰਘ)
Location: Bank of Baroda, near Bus Stand, near Mahilpur, Mahilpur, Punjab 146105
Contact: 82888-37597, 99156-28427 | Email: enterprisesmbee@gmail.com

Run with:
  pip install -r requirements.txt
  uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
"""

import os
from datetime import datetime
from typing import Any, Dict, List, Optional
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

app = FastAPI(
    title="M Bee Enterprises API",
    description="Financial & Documentation Services in Punjab (Prop. Baljinder Singh & Manpreet Singh)",
    version="1.0.0",
)

raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173")
origins = [o.strip() for o in raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class EnquiryPayload(BaseModel):
    userName: str
    userMobile: str
    userCity: Optional[str] = "Mahilpur, Punjab"
    userEmail: Optional[str] = ""
    memberId: Optional[str] = ""
    serviceName: str
    workDescription: str
    preferredContact: Optional[str] = "whatsapp"
    referenceCode: Optional[str] = ""
    status: Optional[str] = "Pending"


class StatusUpdatePayload(BaseModel):
    status: str


ENQUIRIES_STORE: List[Dict[str, Any]] = [
    {
        "id": "ENQ-SEED-101",
        "referenceCode": "WRK-4821",
        "userName": "Gurpreet Singh",
        "userMobile": "9876543210",
        "userCity": "Mahilpur, Punjab",
        "serviceName": "Passport Application Assistance",
        "workDescription": "Fresh Passport application and PSK appointment slot booking at Jalandhar/Hoshiarpur.",
        "preferredContact": "whatsapp",
        "status": "Pending",
        "createdAt": "10:15 AM",
    },
    {
        "id": "ENQ-SEED-102",
        "referenceCode": "WRK-5190",
        "userName": "Harjinder Kaur",
        "userMobile": "9814011223",
        "userCity": "Garhshankar, Punjab",
        "serviceName": "Home Loan Assistance",
        "workDescription": "Home construction loan file assessment and 6-month bank statement review.",
        "preferredContact": "call",
        "status": "Processing",
        "createdAt": "11:30 AM",
    },
    {
        "id": "ENQ-SEED-103",
        "referenceCode": "WRK-6034",
        "userName": "Sukhdev Singh",
        "userMobile": "9417299881",
        "userCity": "Chabbewal, Punjab",
        "serviceName": "PAN Card & Aadhaar Linking",
        "workDescription": "Demographic name correction on PAN card and Aadhaar-PAN linking verification.",
        "preferredContact": "whatsapp",
        "status": "Completed",
        "createdAt": "Yesterday",
    },
]


@app.get("/api/health")
def health_check() -> Dict[str, Any]:
    return {
        "status": "ok",
        "proprietors": "Baljinder Singh & Manpreet Singh",
        "enquiriesCount": len(ENQUIRIES_STORE),
    }


@app.get("/api/enquiries")
def list_enquiries() -> Dict[str, Any]:
    return {
        "enquiries": ENQUIRIES_STORE,
        "totalCount": len(ENQUIRIES_STORE),
        "pendingCount": sum(1 for e in ENQUIRIES_STORE if e.get("status") == "Pending"),
        "processingCount": sum(1 for e in ENQUIRIES_STORE if e.get("status") == "Processing"),
        "completedCount": sum(1 for e in ENQUIRIES_STORE if e.get("status") == "Completed"),
    }


@app.post("/api/enquiries")
def create_enquiry(payload: EnquiryPayload) -> Dict[str, Any]:
    new_record = {
        **payload.model_dump(),
        "id": f"ENQ-{int(datetime.now().timestamp() * 1000)}",
        "referenceCode": payload.referenceCode or "WRK-NEW",
        "status": payload.status or "Pending",
        "createdAt": datetime.now().strftime("%I:%M %p"),
    }
    ENQUIRIES_STORE.insert(0, new_record)
    return {"synced": True, "enquiry": new_record, "totalCount": len(ENQUIRIES_STORE)}


@app.patch("/api/enquiries/{enquiry_id}/status")
def update_enquiry_status(enquiry_id: str, payload: StatusUpdatePayload) -> Dict[str, Any]:
    updated = None
    for item in ENQUIRIES_STORE:
        if item["id"] == enquiry_id:
            item["status"] = payload.status
            updated = item
            break
    return {"synced": True, "id": enquiry_id, "status": payload.status, "enquiry": updated}
