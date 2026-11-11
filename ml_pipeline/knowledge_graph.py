import pandas as pd
import json
from pathlib import Path

DATASET_DIR = Path("doc/Dataset")
DATASET_DIR.mkdir(parents=True, exist_ok=True)

def build_requisite_table():
    """Generates the prerequisite edge list for the DAG based on syllabus extraction."""
    # Source -> Target (Prerequisite -> Dependent Course)
    # Using 'rule_type' to indicate if a student needs ALL (AND) or ANY (OR) of the mapped prerequisites
    prereq_data = [
        # Network Security and Resilience
        {"prerequisite": "TNE10006", "dependent": "TNE30009", "rule_type": "OR"},
        
        # Concurrent Programming
        {"prerequisite": "COS20007", "dependent": "COS40003", "rule_type": "OR"},
        {"prerequisite": "SWE20004", "dependent": "COS40003", "rule_type": "OR"},
        {"prerequisite": "COS30008", "dependent": "COS40003", "rule_type": "OR"},
        
        # Software Architectures and Design
        {"prerequisite": "COS20007", "dependent": "SWE30003", "rule_type": "AND"}, # Also requires 150 Credit Points
        
        # Artificial Intelligence Engineering
        {"prerequisite": "COS10009", "dependent": "COS40007", "rule_type": "AND"}, # Also requires 100 Credit Points
        
        # Applied Machine Learning
        {"prerequisite": "COS30019", "dependent": "COS30082", "rule_type": "OR"},
        {"prerequisite": "COS30018", "dependent": "COS30082", "rule_type": "OR"},
        
        # Introduction to Artificial Intelligence
        {"prerequisite": "COS20007", "dependent": "COS30019", "rule_type": "OR"},
        {"prerequisite": "COS30008", "dependent": "COS30019", "rule_type": "OR"},
        
        # Intelligent Systems
        {"prerequisite": "COS20007", "dependent": "COS30018", "rule_type": "OR"},
        {"prerequisite": "SWE20004", "dependent": "COS30018", "rule_type": "OR"},
        {"prerequisite": "COS20011", "dependent": "COS30018", "rule_type": "OR"},
        
        # Computing Technology Project A
        {"prerequisite": "COS20007", "dependent": "COS40005", "rule_type": "ASSUMED"},
        {"prerequisite": "COS20031", "dependent": "COS40005", "rule_type": "ASSUMED"}
    ]
    
    df_prereqs = pd.DataFrame(prereq_data)
    output_path = DATASET_DIR / "Course_Prerequisites.csv"
    df_prereqs.to_csv(output_path, index=False)
    print(f"Requisite table saved to {output_path}")

def build_catalogue_mapping():
    """Bridges the Target Careers to the Catalogue IDs and Syllabus Unit Codes."""
    
    job_to_catalogue = {
        "AI / Machine Learning Engineer": "CS_AI_ENGINEERING",
        "Data Scientist": "CS_DATA_SCIENCE",
        "Software Architect": "CS_SOFTWARE_ARCH",
        "Cloud / Network Architect": "CS_CLOUD",
        "Research / Academic AI": "CS_AI"
    }
    
    catalogue_to_course = {
        "CS_AI_ENGINEERING": ["COS40007", "COS30082"],
        "CS_DATA_SCIENCE": ["COS10022"],
        "CS_SOFTWARE_ARCH": ["SWE30003", "COS40003"],
        "CS_CLOUD": ["COS20019"],
        "CS_NETWORK": ["TNE10006", "TNE10003", "TNE30009"],
        "CS_AI": ["COS30019", "COS30018"],
        "CS_PROGRAMMING": ["COS10009", "COS20007", "SWE20004"]
    }
    
    mapping_data = {
        "job_to_catalogue": job_to_catalogue,
        "catalogue_to_course": catalogue_to_course
    }
    
    output_path = DATASET_DIR / "Taxonomy_Mapping.json"
    with open(output_path, "w") as f:
        json.dump(mapping_data, f, indent=4)
        
    print(f"Catalogue mappings saved to {output_path}")

if __name__ == "__main__":
    build_requisite_table()
    build_catalogue_mapping()
