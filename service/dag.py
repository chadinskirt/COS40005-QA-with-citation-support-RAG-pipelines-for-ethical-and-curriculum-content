import networkx as nx
import matplotlib.pyplot as plt
from csv_loader import load_students, StudentCourse , Student # type: ignore

def build_course_graph(prerequisites: dict[str, list[str]]) -> nx.DiGraph:
    G = nx.DiGraph()

    for course, dependent_courses in prerequisites.items():
        for dependent in dependent_courses:
            G.add_edge(course, dependent)

    return G

def main():
    # create students obj
    students = load_students("/mnt/d/COS40005-QA-with-citation-support-RAG-pipelines-for-ethical-and-curriculum-content/doc/Dataset/Synthetic_Student_Profiles_v1.csv")
    # build graph (dummy data)
    G = build_course_graph({

        "COS10001": ["COS20007"],

        "COS20007": ["COS30019", "COS30018", "TNE10003"],

        "COS30008": ["COS40003"],

        "COS30019": ["COS40001"]
    })

    # check for cyclic
    assert nx.is_directed_acyclic_graph(G)
    #print(list(nx.topological_sort(G)))

    student_list = [students[1000006], students[1000007], students[1000008], students[1000009] , students[1000010]]
    layers = {}
    # create seed for layer in dag
    for node in nx.topological_sort(G):
        predecessors = list(G.predecessors(node))

        layers[node] = (
            0 if not predecessors
            else 1 + max(layers[p] for p in predecessors)
        )

    nx.set_node_attributes(G, layers, "layer")

    pos = nx.multipartite_layout(
        G,
        subset_key="layer",
        align="vertical"
    )
    for student in student_list:
        #look for completed course for every student
        completed = {
            course.course_id
            for course in student.courses
        }

        available_courses = []

        #store and update course available to assign for every students 
        for course in G.nodes:

            if course in completed:
                continue

            prerequisites = list(G.predecessors(course))

            if all(p in completed for p in prerequisites):
                available_courses.append(course)

        #print(student.student_id, available_courses)
        nx.draw(
            G,
            pos,
            with_labels=True,
            node_size=2500,
            node_color="lightblue",
            arrows=True
        )
        plt.show()


if __name__ == "__main__":
    main()