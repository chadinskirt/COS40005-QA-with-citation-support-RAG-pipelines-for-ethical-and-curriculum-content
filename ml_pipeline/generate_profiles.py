import pandas as pd
import random
import os

# Set seed for reproducibility
random.seed(42)

# Define the Taxonomy Careers based on the manual mapping
careers = [
    "AI / Machine Learning Engineer",
    "Data Scientist",
    "Cloud / Network Architect",
    "Software Architect",
    "Research / Academic AI"
]

# Define study goals
study_goals = ["Industry Placement", "Academic Research", "Startup / Entrepreneurship"]

# Define a pool of foundational prerequisite courses
foundational_courses = [
    "COS10009", # Intro to Programming
    "COS20007", # Object Oriented Programming
    "TNE10003", # LAN Principles
    "SWE20004", # Technical Software Development
]

# Define the target electives from our taxonomy
target_electives = [
    "COS40007", # AI Engineering
    "COS30018", # Intelligent Systems
    "COS10022", # Data Science Principles
    "COS20019", # Cloud Computing Architecture
    "TNE10006", # Networks and Switching
    "SWE30003", # Software Architectures and Design
    "COS30019", # Intro to AI
]

# Helper function to generate a realistic student history
def generate_history(is_edge_case=False):
    history = []
    
    if is_edge_case == "no_prereq":
        # Missing foundational courses (e.g., failed or didn't take Intro to Programming)
        pass 
    elif is_edge_case == "cold_start":
        # First year student, no courses completed
        return []
    else:
        # Standard student: has 2-4 foundational courses
        num_foundational = random.randint(2, len(foundational_courses))
        history.extend(random.sample(foundational_courses, num_foundational))
        
        # Maybe has taken 1 or 2 electives already
        if random.random() > 0.5:
            num_electives = random.randint(1, 2)
            history.extend(random.sample(target_electives, num_electives))
            
    # Format the history with mock grades
    history_with_grades = []
    for course in history:
        # 80% pass rate, 20% fail/withdraw
        grade = random.randint(50, 100) if random.random() > 0.2 else random.randint(0, 49)
        history_with_grades.append(f"{course}:{grade}")
        
    return history_with_grades

# Generate 35 profiles (30 standard, 5 edge cases)
profiles = []
student_id_counter = 1000000

for i in range(35):
    # Determine if edge case
    if i < 3:
        edge = "no_prereq"
    elif i < 6:
        edge = "cold_start"
    else:
        edge = False
        
    history = generate_history(is_edge_case=edge)
    
    profile = {
        "Student_ID": student_id_counter,
        "Completed_Courses": ",".join(history) if history else "NONE",
        "Target_Career": random.choice(careers),
        "Study_Goal": random.choice(study_goals)
    }
    profiles.append(profile)
    student_id_counter += 1

# Ensure directory exists
output_dir = "doc/Dataset"
if not os.path.exists(output_dir):
    os.makedirs(output_dir)

# Create DataFrame and save
df = pd.DataFrame(profiles)
output_path = f"{output_dir}/Synthetic_Student_Profiles_v1.csv"
df.to_csv(output_path, index=False)

print(f"Profiles generated and saved to {output_path}")
