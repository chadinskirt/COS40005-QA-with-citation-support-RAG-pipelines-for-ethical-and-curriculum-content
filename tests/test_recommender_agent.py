import asyncio
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

from backend import main as backend_main
from backend import rag_engine
from service import recommender, recommender_agent


class RecommenderAgentTests(unittest.TestCase):
    def test_recommend_question_triggers_recommender_agent_and_grounds_units(self):
        fake_student = SimpleNamespace(
            student_id=105543704,
            major_code="artificial-intelligence",
            target_career="ML Engineer",
            study_goal="Graduate on time",
            passed_units=["COS10009"],
            failed_units=["COS20007"],
            enrolled_units=[],
        )
        fake_course = SimpleNamespace(code="COS20007", name="Object Oriented Programming", credit_points=12.5)
        fake_prereq = SimpleNamespace(prerequisite_code="COS10009", dependent_code="COS20007", rule_type="AND")

        fake_db = MagicMock()
        fake_db.query.return_value.distinct.return_value.all.return_value = [
            ("COS10009",),
            ("COS20007",),
            ("COS30082",),
        ]
        # execute().scalars().all() / execute().scalar_one_or_none()
        fake_db.execute.return_value.scalar_one_or_none.return_value = fake_student
        fake_db.execute.return_value.scalars.return_value.all.side_effect = [
            [fake_course],   # Course query in get_chat_response
            [fake_prereq],   # Prerequisite query in tool_get_current_semester_recommendations
            [fake_course],   # Course query in _build_curriculum_context
            [fake_prereq],   # Prerequisite query in _build_curriculum_context
        ]
        fake_db.execute.return_value.all.return_value = []  # no pgvector chunks needed

        fake_plan = {
            "major": {"id": "artificial-intelligence", "name": "Artificial Intelligence"},
            "semesters": [
                {
                    "index": 1,
                    "name": "Current Semester Recommendations",
                    "credit_points": 12.5,
                    "units": [
                        {
                            "code": "COS20007",
                            "name": "Object Oriented Programming",
                            "credit_points": 12.5,
                            "description": "Object-oriented design principles.",
                            "rank": 1,
                            "is_retake": True,
                            "status": "Retake Required",
                            "reason": "mandatory retake",
                        }
                    ],
                }
            ],
            "blocked_units": [],
            "violations": 0,
            "completed_units": ["COS10009"],
            "failed_units": ["COS20007"],
            "enrolled_units": [],
        }

        captured_payload = {}

        class FakeResp:
            def json(self):
                return {
                    "message": {
                        "content": "| Code | Name | Status |\n| --- | --- | --- |\n| COS20007 | Object Oriented Programming | Retake Required |"
                    }
                }

        def fake_post(url, json=None, timeout=None):
            captured_payload.update(json or {})
            return FakeResp()

        fake_embedder = MagicMock()
        fake_embedder.encode.return_value.tolist.return_value = [0.1] * 384

        with (
            patch.object(rag_engine, "SessionLocal", return_value=fake_db),
            patch.object(rag_engine, "_get_embedder", return_value=fake_embedder),
            patch.object(recommender_agent, "generate_study_plan", return_value=fake_plan),
            patch.object(rag_engine, "generate_study_plan", return_value=fake_plan),
            patch.object(rag_engine.requests, "post", side_effect=fake_post),
        ):
            res = rag_engine.get_chat_response(
                "What are my recommended units this semester?",
                student_id=105543704,
                major_code="artificial-intelligence",
            )

        self.assertFalse(res["abstained"])
        self.assertIn("Recommender Agent", res["tool_calls_used"])
        self.assertIn("COS20007", res["answer"])
        user_msg = captured_payload["messages"][1]["content"]
        self.assertIn("Course Recommender Sub-Agent Output", user_msg)
        self.assertIn("COS20007", user_msg)

    def test_unit_summary_question_triggers_syllabus_retriever_and_returns_citations(self):
        fake_course = SimpleNamespace(code="COS30082", name="Applied Machine Learning", credit_points=12.5)
        fake_chunk_overview = SimpleNamespace(
            course_code="COS30082",
            section="overview",
            chunk_index=0,
            content="Covers supervised and unsupervised learning, neural networks, and model evaluation.",
        )
        fake_chunk_assess = SimpleNamespace(
            course_code="COS30082",
            section="assessments",
            chunk_index=1,
            content="Project 50% and Final Exam 50%.",
        )

        fake_db = MagicMock()
        fake_db.query.return_value.distinct.return_value.all.return_value = [
            ("COS10009",),
            ("COS20007",),
            ("COS30082",),
        ]
        fake_db.execute.return_value.scalar_one_or_none.return_value = fake_course
        fake_db.execute.return_value.scalars.return_value.all.side_effect = [
            [fake_course],                      # Course query in get_chat_response
            [],                                 # Prerequisite query in tool_lookup_unit_syllabus
            [fake_chunk_overview, fake_chunk_assess],  # SyllabusChunk query in tool_lookup_unit_syllabus
            [fake_course],                      # Course query in _build_curriculum_context
            [],                                 # Prerequisite query in _build_curriculum_context
        ]

        captured_payload = {}

        class FakeResp:
            def json(self):
                return {
                    "message": {
                        "content": "- Covers neural networks [Unit Outline: COS30082 — overview](#citation-1)."
                    }
                }

        def fake_post(url, json=None, timeout=None):
            captured_payload.update(json or {})
            return FakeResp()

        fake_embedder = MagicMock()
        fake_embedder.encode.return_value.tolist.return_value = [0.1] * 384

        with (
            patch.object(rag_engine, "SessionLocal", return_value=fake_db),
            patch.object(rag_engine, "_get_embedder", return_value=fake_embedder),
            patch.object(rag_engine.requests, "post", side_effect=fake_post),
        ):
            res = rag_engine.get_chat_response(
                "Give me a detailed brief summary of COS30082 (Applied Machine Learning).",
                major_code="artificial-intelligence",
            )

        self.assertFalse(res["abstained"])
        self.assertIn("Syllabus Retriever", res["tool_calls_used"])
        self.assertEqual(len(res["citations"]), 2)
        self.assertEqual(res["citations"][0]["index"], 1)
        self.assertEqual(res["citations"][0]["unit_code"], "COS30082")
        self.assertEqual(res["citations"][0]["section"], "overview")
        self.assertIn("neural networks", res["citations"][0]["content"])
        self.assertEqual(res["citations"][1]["index"], 2)
        self.assertEqual(res["citations"][1]["section"], "assessments")

    def test_uningested_unit_excluded_from_units_recommender_and_syllabus_lookup(self):
        cos20007 = SimpleNamespace(code="COS20007", name="Object Oriented Programming", credit_points=12.5)
        swe20004 = SimpleNamespace(code="SWE20004", name="Technical Software Development", credit_points=12.5)
        swe30003 = SimpleNamespace(code="SWE30003", name="Software Architectures and Design", credit_points=12.5)
        prereq_uningested = SimpleNamespace(
            prerequisite_code="SWE20004", dependent_code="SWE30003", rule_type="AND"
        )
        chunk_cos20007 = SimpleNamespace(
            course_code="COS20007",
            section="summary",
            chunk_index=0,
            content="Object-oriented design.",
        )
        chunk_swe30003 = SimpleNamespace(
            course_code="SWE30003",
            section="summary",
            chunk_index=0,
            content="Software architecture.",
        )

        # 1. Verify GET /api/units excludes SWE20004
        units_db = MagicMock()
        units_db.query.return_value.distinct.return_value.all.return_value = [("COS20007",), ("SWE30003",)]
        units_db.execute.return_value.scalars.return_value.all.return_value = [cos20007, swe20004, swe30003]
        with patch.object(backend_main, "SessionLocal", return_value=units_db):
            units_resp = asyncio.run(backend_main.get_units())
        returned_codes = [u["code"] for u in units_resp["units"]]
        self.assertIn("COS20007", returned_codes)
        self.assertIn("SWE30003", returned_codes)
        self.assertNotIn("SWE20004", returned_codes)

        # 2. Verify generate_study_plan() excludes SWE20004 and prunes its prerequisite edge
        class _FakeQuery:
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

        plan_db = MagicMock()
        def query_side_effect(model):
            name = getattr(model, "__name__", "")
            if name == "Course":
                return _FakeQuery([cos20007, swe20004, swe30003])
            if name == "Prerequisite":
                return _FakeQuery([prereq_uningested])
            if name == "CatalogueMapping":
                return _FakeQuery([])
            if name == "SyllabusChunk":
                return _FakeQuery([chunk_cos20007, chunk_swe30003])
            if getattr(model, "key", "") == "course_code":
                return _FakeQuery([("COS20007",), ("SWE30003",)])
            return _FakeQuery([])

        plan_db.query.side_effect = query_side_effect
        with patch.object(recommender, "SessionLocal", return_value=plan_db):
            plan = recommender.generate_study_plan("software-development", completed_codes=[])

        dag_ids = [n["id"] for n in plan["dag_graph"]["nodes"]]
        self.assertNotIn("SWE20004", dag_ids)
        self.assertIn("SWE30003", dag_ids)
        self.assertEqual(plan["dag_graph"]["edges"], [])

        # 3. Verify tool_lookup_unit_syllabus and get_chat_response abstain for SWE20004
        chat_db = MagicMock()
        chat_db.query.return_value.distinct.return_value.all.return_value = [("COS20007",), ("SWE30003",)]
        lookup_res = recommender_agent.tool_lookup_unit_syllabus(chat_db, "SWE20004")
        self.assertFalse(lookup_res["found"])
        self.assertEqual(lookup_res["citations"], [])

        with patch.object(rag_engine, "SessionLocal", return_value=chat_db):
            chat_res = rag_engine.get_chat_response("Tell me about SWE20004")
        self.assertTrue(chat_res["abstained"])
        self.assertEqual(chat_res["abstain_reason"], "UNIT_NOT_FOUND")
        self.assertEqual(chat_res["citations"], [])


if __name__ == "__main__":
    unittest.main()
