import pandas as pd
from pathlib import Path

# Define file paths based on the project structure
DATASET_DIR = Path("doc/Dataset")
INPUT_FILE = DATASET_DIR / "Synthetic_Student_Profiles_v1.csv"
OUTPUT_INTERACTIONS = DATASET_DIR / "User_Item_Interactions.csv"
OUTPUT_PIVOT = DATASET_DIR / "User_Item_Pivot_Matrix.csv"

def transform_profiles():
    # Load the synthetic profiles
    df = pd.read_csv(INPUT_FILE)
    interactions = []

    # Parse the "Completed_Courses" column (e.g., "COS10009:85,SWE20004:42")
    for index, row in df.iterrows():
        student_id = row['Student_ID']
        courses_str = row['Completed_Courses']
        
        # Skip cold-start edge cases with "NONE"
        if pd.notna(courses_str) and courses_str != "NONE":
            course_list = courses_str.split(',')
            for course_grade in course_list:
                if ':' in course_grade:
                    course, grade = course_grade.split(':')
                    interactions.append({
                        'Student_ID': student_id,
                        'Course_ID': course,
                        'Rating': int(grade)
                    })

    # Convert to DataFrame
    interaction_df = pd.DataFrame(interactions)

    # 1. Save the 3-column format (Standard for Surprise / Scikit-Learn)
    interaction_df.to_csv(OUTPUT_INTERACTIONS, index=False)
    
    # 2. Save the wide pivoted matrix (Standard for Matrix Factorization / GNNs)
    pivot_matrix = interaction_df.pivot(index='Student_ID', columns='Course_ID', values='Rating').fillna(0)
    pivot_matrix.to_csv(OUTPUT_PIVOT)

    print(f"Transformation complete. Processed {len(interaction_df)} total course interactions.")
    print(f"Saved to:\n - {OUTPUT_INTERACTIONS}\n - {OUTPUT_PIVOT}")

if __name__ == "__main__":
    transform_profiles()
