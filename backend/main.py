from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import FileResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
from sqlalchemy import select

from service.models import SessionLocal, Course, CatalogueMapping, Student
from service.recommender import (
    CANONICAL_MAJORS,
    MAJOR_TO_CATALOGUE_IDS,
    generate_study_plan,
    get_ingested_unit_codes,
    CurriculumCycleError,
)
from service.recommender_agent import get_archive_dir
from backend.rag_engine import get_chat_response

app = FastAPI(title="Academic Advising Portal API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Missing or malformed field.",
                "details": {"errors": exc.errors()},
            }
        },
    )


@app.exception_handler(CurriculumCycleError)
async def cycle_exception_handler(request: Request, exc: CurriculumCycleError):
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={
            "error": {
                "code": "CURRICULUM_CYCLE",
                "message": "A circular prerequisite was found in the curriculum data.",
                "details": {"cycle": exc.cycle_nodes},
            }
        },
    )


@app.exception_handler(ValueError)
async def value_error_exception_handler(request: Request, exc: ValueError):
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "error": {
                "code": "INVALID_INPUT",
                "message": str(exc),
                "details": {},
            }
        },
    )


# --- Pydantic Models ---

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    question: str
    history: Optional[List[ChatMessage]] = []
    student_id: Optional[int] = None
    major_code: Optional[str] = None


class RecommendRequest(BaseModel):
    major: str
    completed_units: List[str]
    failed_units: Optional[List[str]] = []
    enrolled_units: Optional[List[str]] = []
    units_per_semester: int = 3
    student_id: Optional[int] = None


class StudentProfileUpdate(BaseModel):
    major_code: Optional[str] = None
    target_career: Optional[str] = None
    study_goal: Optional[str] = None
    passed_units: List[str] = Field(default_factory=list)
    failed_units: List[str] = Field(default_factory=list)
    enrolled_units: List[str] = Field(default_factory=list)


class StudentPlanRequest(BaseModel):
    major_override: Optional[str] = None
    units_per_semester: int = 3


# --- Helpers ---

def _normalize_codes(codes: Optional[List[str]]) -> List[str]:
    if not codes:
        return []
    seen = set()
    cleaned = []
    for c in codes:
        code = c.strip().upper()
        if code and code not in seen:
            seen.add(code)
            cleaned.append(code)
    return cleaned


def _serialize_student(student: Student) -> dict:
    return {
        "student_id": student.student_id,
        "major_code": student.major_code,
        "target_career": student.target_career,
        "study_goal": student.study_goal,
        "passed_units": student.passed_units or [],
        "failed_units": student.failed_units or [],
        "enrolled_units": student.enrolled_units or [],
    }


def _build_current_student_plan(
    major: str,
    passed_units: List[str],
    failed_units: List[str],
    enrolled_units: List[str],
    units_per_semester: int = 3,
) -> dict:
    return generate_study_plan(
        major_id=major,
        completed_codes=_normalize_codes(passed_units),
        failed_codes=_normalize_codes(failed_units),
        enrolled_codes=_normalize_codes(enrolled_units),
        units_per_semester=units_per_semester,
    )


# --- Endpoints ---

@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "version": "2.0.0",
        "engines": {"rag": "pgvector", "dag": "ok"},
    }


@app.get("/api/majors")
async def get_majors():
    return {"majors": CANONICAL_MAJORS}


@app.get("/api/units")
async def get_units(major: Optional[str] = None):
    db = SessionLocal()
    try:
        ingested = get_ingested_unit_codes(db)
        courses = db.execute(select(Course).order_by(Course.code)).scalars().all()
        return {
            "units": [
                {
                    "code": c.code,
                    "name": c.name,
                    "credit_points": c.credit_points,
                }
                for c in courses
                if c.code and c.code.upper() in ingested
            ]
        }
    finally:
        db.close()


# --- Current Student Profile & Planning Endpoints ---

@app.get("/api/students/{student_id}")
async def get_student_profile(student_id: int):
    db = SessionLocal()
    try:
        student = db.execute(
            select(Student).where(Student.student_id == student_id)
        ).scalar_one_or_none()
        if not student:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Student {student_id} not found.",
            )
        return _serialize_student(student)
    finally:
        db.close()


@app.put("/api/students/{student_id}")
async def upsert_student_profile(student_id: int, payload: StudentProfileUpdate):
    db = SessionLocal()
    try:
        student = db.execute(
            select(Student).where(Student.student_id == student_id)
        ).scalar_one_or_none()

        passed = _normalize_codes(payload.passed_units)
        failed = [u for u in _normalize_codes(payload.failed_units) if u not in passed]
        enrolled = [u for u in _normalize_codes(payload.enrolled_units) if u not in passed]

        if not student:
            student = Student(
                student_id=student_id,
                major_code=payload.major_code,
                target_career=payload.target_career,
                study_goal=payload.study_goal,
                passed_units=passed,
                failed_units=failed,
                enrolled_units=enrolled,
            )
            db.add(student)
        else:
            if payload.major_code is not None:
                student.major_code = payload.major_code
            if payload.target_career is not None:
                student.target_career = payload.target_career
            if payload.study_goal is not None:
                student.study_goal = payload.study_goal
            student.passed_units = passed
            student.failed_units = failed
            student.enrolled_units = enrolled

        db.commit()
        db.refresh(student)
        return _serialize_student(student)
    finally:
        db.close()


@app.post("/api/students/{student_id}/plan")
async def generate_student_plan(student_id: int, request: Optional[StudentPlanRequest] = None):
    db = SessionLocal()
    try:
        student = db.execute(
            select(Student).where(Student.student_id == student_id)
        ).scalar_one_or_none()
        if not student:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Student {student_id} not found.",
            )

        major = (
            (request.major_override if request and request.major_override else None)
            or student.major_code
            or "artificial-intelligence"
        )
        units_per_sem = request.units_per_semester if request else 3

        return _build_current_student_plan(
            major=major,
            passed_units=student.passed_units or [],
            failed_units=student.failed_units or [],
            enrolled_units=student.enrolled_units or [],
            units_per_semester=units_per_sem,
        )
    finally:
        db.close()


@app.post("/api/recommend")
async def get_recommendation(request: RecommendRequest):
    return _build_current_student_plan(
        major=request.major,
        passed_units=request.completed_units,
        failed_units=request.failed_units or [],
        enrolled_units=request.enrolled_units or [],
        units_per_semester=request.units_per_semester,
    )


@app.post("/api/chat")
async def chat_rag(request: ChatRequest):
    history_dicts = (
        [{"role": msg.role, "content": msg.content} for msg in request.history]
        if request.history
        else []
    )
    return get_chat_response(
        question=request.question,
        history=history_dicts,
        student_id=request.student_id,
        major_code=request.major_code,
    )


@app.get("/api/documents/{filename:path}")
async def get_document(filename: str):
    archive_root = get_archive_dir().resolve()
    try:
        target = (archive_root / filename).resolve()
    except Exception:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid document path.")

    if target == archive_root or not target.is_relative_to(archive_root):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    if not target.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    suffix = target.suffix.lower()
    if suffix == ".pdf":
        media_type = "application/pdf"
    elif suffix == ".md":
        media_type = "text/markdown; charset=utf-8"
    elif suffix == ".txt":
        media_type = "text/plain; charset=utf-8"
    else:
        media_type = "application/octet-stream"

    return FileResponse(
        path=target,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{target.name}"'},
    )


@app.get("/api/trends")
async def get_trends():
    return {
        "trends": [
            {
                "major": {"id": "artificial-intelligence", "name": "Artificial Intelligence"},
                "summary": "AI and data skills are reported among the fastest-growing skill groups.",
                "citations": [
                    {
                        "id": "chunk_0901",
                        "doc": "WEF Future of Jobs Report",
                        "section": "Skills outlook",
                        "page": 34,
                        "snippet": "...",
                        "similarity": 0.78,
                    }
                ],
            }
        ]
    }
