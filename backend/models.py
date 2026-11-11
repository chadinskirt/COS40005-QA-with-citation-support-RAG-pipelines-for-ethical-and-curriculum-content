import os
from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker

# PostgreSQL connection string format: postgresql://user:password@host:port/dbname
# Defaulting to local dev credentials if no environment variable is set
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://postgres:postgres@localhost:5432/academic_advising"
)

# Initialize PostgreSQL engine (removed the SQLite-specific check_same_thread argument)
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