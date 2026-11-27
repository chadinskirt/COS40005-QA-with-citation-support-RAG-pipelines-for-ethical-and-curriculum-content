import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

# Allow unit tests to run in environments without pgvector/sentence_transformers installed
if "pgvector.sqlalchemy" not in sys.modules:
    from sqlalchemy.types import UserDefinedType
    from sqlalchemy import literal

    class _FakeVector(UserDefinedType):
        def __init__(self, *args, **kwargs):
            pass

        class comparator_factory(UserDefinedType.Comparator):
            def l2_distance(self, other):
                return literal(0.5)

    pgvector_mod = types.ModuleType("pgvector")
    pgvector_sa = types.ModuleType("pgvector.sqlalchemy")
    pgvector_sa.Vector = _FakeVector
    sys.modules.setdefault("pgvector", pgvector_mod)
    sys.modules.setdefault("pgvector.sqlalchemy", pgvector_sa)

if "sentence_transformers" not in sys.modules:
    st_mod = types.ModuleType("sentence_transformers")
    st_mod.SentenceTransformer = MagicMock
    sys.modules["sentence_transformers"] = st_mod

from service import recommender
from backend import rag_engine


class FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def distinct(self):
        return self

    def all(self):
        return self._rows


class RecommenderUpgradeTests(unittest.TestCase):
    def _make_db(self):
        courses = [
            SimpleNamespace(code="COS10009", name="Introduction to Programming", credit_points=12.5),
            SimpleNamespace(code="COS20007", name="Object Oriented Programming", credit_points=12.5),
            SimpleNamespace(code="COS30019", name="Introduction to AI", credit_points=12.5),
        ]
        prereqs = [
            SimpleNamespace(prerequisite_code="COS10009", dependent_code="COS20007", rule_type="AND"),
            SimpleNamespace(prerequisite_code="COS20007", dependent_code="COS30019", rule_type="AND"),
        ]
        chunks = [
            SimpleNamespace(
                course_code="COS20007",
                section="summary",
                chunk_index=0,
                content="Unit Summary: This unit introduces object-oriented design and testing. Students build modular software.",
            ),
        ]

        db = MagicMock()

        def query_side_effect(model):
            name = getattr(model, "__name__", "")
            if name == "Course":
                return FakeQuery(courses)
            if name == "Prerequisite":
                return FakeQuery(prereqs)
            if name == "CatalogueMapping":
                return FakeQuery([])
            if name == "SyllabusChunk":
                return FakeQuery(chunks)
            if getattr(model, "key", "") == "course_code":
                return FakeQuery([("COS10009",), ("COS20007",), ("COS30019",)])
            return FakeQuery([])

        db.query.side_effect = query_side_effect
        return db

    def test_single_semester_cap_and_unit_descriptions(self):
        db = self._make_db()
        with patch.object(recommender, "SessionLocal", return_value=db):
            plan = recommender.generate_study_plan(
                major_id="artificial-intelligence",
                completed_codes=[],
                failed_codes=[],
                enrolled_codes=[],
                units_per_semester=3,
            )

        self.assertEqual(len(plan["semesters"]), 1)
        sem = plan["semesters"][0]
        self.assertEqual(sem["name"], "Current Semester Recommendations")
        self.assertEqual([u["code"] for u in sem["units"]], ["COS10009"])
        self.assertEqual(
            sem["units"][0]["description"],
            "Covers core concepts, practical techniques, and applied problem-solving in Introduction to Programming.",
        )
        blocked_codes = [b["code"] for b in plan["blocked_units"]]
        self.assertIn("COS20007", blocked_codes)
        self.assertIn("COS30019", blocked_codes)

    def test_extracts_syllabus_chunk_description_cleanly(self):
        db = self._make_db()
        with patch.object(recommender, "SessionLocal", return_value=db):
            plan = recommender.generate_study_plan(
                major_id="artificial-intelligence",
                completed_codes=["COS10009"],
                failed_codes=["COS20007"],
                enrolled_codes=[],
                units_per_semester=3,
            )

        self.assertEqual(len(plan["semesters"]), 1)
        unit = plan["semesters"][0]["units"][0]
        self.assertEqual(unit["code"], "COS20007")
        self.assertTrue(unit["is_retake"])
        self.assertEqual(
            unit["description"],
            "This unit introduces object-oriented design and testing. Students build modular software.",
        )

    def test_skips_json_tables_and_strips_pdf_boilerplate(self):
        chunks = [
            SimpleNamespace(
                course_code="COS10026",
                section="tables",
                chunk_index=0,
                content='{"id": "tbl002000", "bbox": [10, 20, 300, 400], "rows": []}',
            ),
            SimpleNamespace(
                course_code="COS10026",
                section="overview",
                chunk_index=1,
                content=(
                    "Unit COS10026 - Web Technology Project (summary): [Page 1] "
                    "School of Science, Computing and Engineering Technologies "
                    "Unit Outline Semester 1 2026 "
                    "Please read this Unit Outline carefully. It includes: PART A Overview. "
                    "This unit introduces full-stack web development using HTML, CSS, and JavaScript. "
                    "Students collaborate in teams to build responsive applications."
                ),
            ),
            SimpleNamespace(
                course_code="COS10004",
                section="tables",
                chunk_index=0,
                content='{"id": "tbl001", "bbox": [0, 0, 100, 100]}',
            ),
        ]
        catalog = {
            "COS10026": {"name": "Web Technology Project", "credit_points": 12.5},
            "COS10004": {"name": "Computer Systems", "credit_points": 12.5},
        }
        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = chunks

        descs = recommender._load_unit_descriptions(db, ["COS10026", "COS10004"], catalog)
        self.assertNotIn("tbl002000", descs["COS10026"])
        self.assertNotIn("Page 1", descs["COS10026"])
        self.assertNotIn("School of Science", descs["COS10026"])
        self.assertEqual(
            descs["COS10026"],
            "This unit introduces full-stack web development using HTML, CSS, and JavaScript. "
            "Students collaborate in teams to build responsive applications.",
        )
        self.assertEqual(
            descs["COS10004"],
            "Covers core concepts, practical techniques, and applied problem-solving in Computer Systems.",
        )

    def test_skips_nested_json_and_unit_description_headers(self):
        chunks = [
            SimpleNamespace(
                course_code="COS20019",
                section="overview",
                chunk_index=0,
                content='Unit COS20019 - Cloud Computing Architecture: {"rows": [{"cells": ["A"]}]}',
            ),
            SimpleNamespace(
                course_code="COS20019",
                section="overview",
                chunk_index=1,
                content=(
                    "COS20019 - Cloud Computing Architecture: Page 2 "
                    "Unit Description: This unit explores cloud infrastructure and distributed services. "
                    "Students deploy scalable applications on modern cloud platforms."
                ),
            ),
        ]
        catalog = {"COS20019": {"name": "Cloud Computing Architecture", "credit_points": 12.5}}
        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = chunks

        descs = recommender._load_unit_descriptions(db, ["COS20019"], catalog)
        self.assertEqual(
            descs["COS20019"],
            "This unit explores cloud infrastructure and distributed services. "
            "Students deploy scalable applications on modern cloud platforms.",
        )


class RagEngineUpgradeTests(unittest.TestCase):
    def test_chat_response_formats_numbered_citations_and_structured_prompt(self):
        chunk = SimpleNamespace(
            course_code="COS20007",
            section="assessments",
            chunk_index=0,
            content="Portfolio 60% and Final Test 40%.",
        )
        fake_db = MagicMock()
        fake_db.query.return_value.distinct.return_value.all.return_value = [("COS20007",)]
        fake_course = SimpleNamespace(code="COS20007", name="Object Oriented Programming", credit_points=12.5)
        fake_db.execute.return_value.scalar_one_or_none.return_value = fake_course
        fake_db.execute.return_value.scalars.return_value.all.side_effect = [
            [fake_course],  # Course query in get_chat_response
            [],             # Prerequisite query in tool_lookup_unit_syllabus
            [chunk],        # SyllabusChunk query in tool_lookup_unit_syllabus
            [fake_course],  # Course query in _build_curriculum_context
            [],             # Prerequisite query in _build_curriculum_context
        ]

        fake_embedder = MagicMock()
        fake_embedder.encode.return_value.tolist.return_value = [0.1] * 384

        captured_payload = {}

        class FakeResp:
            def json(self):
                return {
                    "message": {
                        "content": "| Task | Weight |\n| --- | --- |\n| Portfolio | 60% |\n\nSee [COS20007 (assessments)](#citation-1)."
                    }
                }

        def fake_post(url, json=None, timeout=None):
            captured_payload.update(json or {})
            return FakeResp()

        with (
            patch.object(rag_engine, "SessionLocal", return_value=fake_db),
            patch.object(rag_engine, "_get_embedder", return_value=fake_embedder),
            patch.object(rag_engine.requests, "post", side_effect=fake_post),
        ):
            res = rag_engine.get_chat_response("How is COS20007 assessed?")

        self.assertFalse(res["abstained"])
        self.assertEqual(len(res["citations"]), 1)
        cit = res["citations"][0]
        self.assertEqual(cit["id"], "c1")
        self.assertEqual(cit["index"], 1)
        self.assertEqual(cit["unit_code"], "COS20007")
        self.assertEqual(cit["unit_name"], "Object Oriented Programming")
        self.assertEqual(cit["section"], "assessments")
        self.assertEqual(cit["source_file"], "COS20007_Unit Outline_May2025 HCM.pdf")
        self.assertTrue(cit["document_url"].startswith("/api/documents/"))
        self.assertEqual(cit["content"], "Portfolio 60% and Final Test 40%.")
        self.assertEqual(cit["similarity"], 1.0)
        system_msg = captured_payload["messages"][0]["content"]
        user_msg = captured_payload["messages"][1]["content"]
        self.assertIn("[1]", system_msg)
        self.assertIn("GFM Markdown tables", system_msg)
        self.assertIn("[Citation 1] Unit: COS20007 (Object Oriented Programming) | Section: assessments", user_msg)


if __name__ == "__main__":
    unittest.main()
