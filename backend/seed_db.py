import pandas as pd
import json
from pathlib import Path
from models import engine, Base, SessionLocal, Course, Prerequisite, CatalogueMapping, Student

BASE_DIR = Path(__file__).resolve().parent.parent
DATASET_DIR = BASE_DIR / "doc" / "Dataset"

print(f"Looking for data in: {DATASET_DIR}") # Added a print statement to debug

def seed_database():
    # 1. Create all tables
    Base.metadata.drop_all(bind=engine) # Reset for clean seed
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()

    print("Tables created. Seeding data...")

    # 2. Seed Courses (Extracted from Catalogue Mapping and Prerequisites)
    # This ensures all referenced courses exist in the primary table
    prereq_df = pd.read_csv(DATASET_DIR / "Course_Prerequisites.csv")
    unique_courses = set(prereq_df['prerequisite']).union(set(prereq_df['dependent']))
    
    with open(DATASET_DIR / "Taxonomy_Mapping.json", "r") as f:
        taxonomy = json.load(f)
        for courses in taxonomy["catalogue_to_course"].values():
            unique_courses.update(courses)

    for code in unique_courses:
        session.add(Course(code=code, name=f"Unit {code}", credit_points=12.5))
    session.commit()

    # 3. Seed Prerequisites
    for _, row in prereq_df.iterrows():
        session.add(Prerequisite(
            dependent_code=row['dependent'],
            prerequisite_code=row['prerequisite'],
            rule_type=row['rule_type']
        ))
    session.commit()

    # 4. Seed Catalogue Mappings
    for cat_id, courses in taxonomy["catalogue_to_course"].items():
        for code in courses:
            session.add(CatalogueMapping(catalogue_id=cat_id, course_code=code))
    session.commit()

    # 5. Seed Students
    student_df = pd.read_csv(DATASET_DIR / "Synthetic_Student_Profiles_v1.csv")
    for _, row in student_df.iterrows():
        session.add(Student(
            student_id=int(row['Student_ID']),
            target_career=row['Target_Career'],
            study_goal=row['Study_Goal']
        ))
    session.commit()

    print(f"Database successfully seeded at {engine.url}")
    session.close()

if __name__ == "__main__":
    seed_database()