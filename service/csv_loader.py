import pandas as pd

from dataclasses import dataclass
from enum import Enum


class CourseStatus(Enum):
    COMPLETED = "Completed"
    ENROLLED = "Enrolled"
    FAILED = "Failed"


@dataclass
class StudentCourse:
    course_id: str
    grade: float
    status: CourseStatus


@dataclass
class Student:
    student_id: int
    courses: list[StudentCourse]
    target_career: str
    study_goal: str

def load_students(filepath: str) -> dict[int, Student]:
    df = pd.read_csv(filepath)

    students = {}

    for row in df.itertuples(index=False):

        courses = []

        if row.Completed_Courses != "NONE":
            for entry in row.Completed_Courses.split(","):
                course_id, grade = entry.split(":")

                courses.append(
                    StudentCourse(
                        course_id=course_id,
                        grade=float(grade),
                        status=CourseStatus.COMPLETED
                    )
                )

        students[row.Student_ID] = Student(
            student_id=row.Student_ID,
            courses=courses,
            target_career=row.Target_Career,
            study_goal=row.Study_Goal
        )

    return students


