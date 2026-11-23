import os
from dataclasses import dataclass
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Float,
    Text,
    ForeignKey,
    Index,
    JSON,
    text,
)
from sqlalchemy.orm import declarative_base, sessionmaker
from pgvector.sqlalchemy import Vector

# PostgreSQL connection string format: postgresql://user:password@host:port/dbname
# Defaulting to local dev credentials if no environment variable is set
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/academic_advising",
)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Course(Base):
    __tablename__ = "courses"
    code = Column(String, primary_key=True, index=True)
    name = Column(String)
    credit_points = Column(Float, default=12.5)


class Prerequisite(Base):
    __tablename__ = "prerequisites"
    id = Column(Integer, primary_key=True, autoincrement=True)
    dependent_code = Column(String, ForeignKey("courses.code"), index=True)
    prerequisite_code = Column(String, ForeignKey("courses.code"))
    rule_type = Column(String)  # OR, AND, ASSUMED


class CatalogueMapping(Base):
    __tablename__ = "catalogue_mappings"
    id = Column(Integer, primary_key=True, autoincrement=True)
    catalogue_id = Column(String, index=True)
    course_code = Column(String, ForeignKey("courses.code"))


class Student(Base):
    __tablename__ = "students"
    student_id = Column(Integer, primary_key=True, index=True)
    target_career = Column(String)
    study_goal = Column(String)

    # Current Student academic state (defaults keep existing inserts backwards-compatible)
    major_code = Column(String, nullable=True, index=True)
    passed_units = Column(JSON, default=list, nullable=False)
    failed_units = Column(JSON, default=list, nullable=False)
    enrolled_units = Column(JSON, default=list, nullable=False)


class SyllabusChunk(Base):
    """
    Replaces ChromaDB: stores structured syllabus chunks and 384-dim embeddings
    (all-MiniLM-L6-v2) directly in PostgreSQL via pgvector.
    """
    __tablename__ = "syllabus_chunks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    course_code = Column(
        String,
        ForeignKey("courses.code", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    section = Column(String, nullable=False, index=True)  # e.g., summary, prerequisites, assessments, hurdles
    chunk_index = Column(Integer, default=0, nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(384), nullable=False)

    __table_args__ = (
        Index(
            "ix_syllabus_chunks_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_l2_ops"},
        ),
    )


@dataclass
class CatalogueResult:
    weights: dict[str, float]
    scores: dict[str, float]
    contributions: dict[str, float]
    score: float


# @dataclass
# class CourseFeatures:
#     course_id: str
#     catalogue: CatalogueResult
#     academic: AcademicResult
#     progression: ProgressionResult


def init_db() -> None:
    """Enable pgvector extension and create all tables."""
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(bind=engine)
