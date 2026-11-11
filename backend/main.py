from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

# Import your newly built ML engines
from recommender import generate_study_plan, CurriculumCycleError
from rag_engine import get_chat_response

app = FastAPI(title="Academic Advising Portal API", version="1.1")

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
                "details": {"errors": exc.errors()}
            }
        }
    )

@app.exception_handler(CurriculumCycleError)
async def cycle_exception_handler(request: Request, exc: CurriculumCycleError):
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={
            "error": {
                "code": "CURRICULUM_CYCLE",
                "message": "A circular prerequisite was found in the curriculum data.",
                "details": {"cycle": exc.cycle_nodes}
            }
        }
    )

# --- Pydantic Models ---

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    question: str
    history: Optional[List[ChatMessage]] = []

class RecommendRequest(BaseModel):
    major: str
    completed_units: List[str]

# --- Endpoints ---

@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "version": "1.1.0",
        "engines": {"rag": "ok", "dag": "ok"}
    }

@app.get("/api/majors")
async def get_majors():
    return {
        "majors": [
            {"id": "artificial-intelligence", "name": "Artificial Intelligence"}
        ]
    }

@app.get("/api/units")
async def get_units(major: str):
    return {
        "units": [
            {"code": "COS10009", "name": "Introduction to Programming", "credit_points": 12.5},
            {"code": "COS20007", "name": "Object Oriented Programming", "credit_points": 12.5},
            {"code": "COS30019", "name": "Introduction to Artificial Intelligence", "credit_points": 12.5},
            {"code": "COS40007", "name": "Artificial Intelligence Engineering", "credit_points": 12.5}
        ]
    }

@app.post("/api/recommend")
async def get_recommendation(request: RecommendRequest):
    # Engine 1: DAG Recommender
    result = generate_study_plan(request.major, request.completed_units)
    return result

@app.post("/api/chat")
async def chat_rag(request: ChatRequest):
    # Engine 2: RAG Chatbot
    history_dicts = [{"role": msg.role, "content": msg.content} for msg in request.history] if request.history else []
    result = get_chat_response(request.question, history_dicts)
    return result

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
                        "similarity": 0.78
                    }
                ]
            }
        ]
    }