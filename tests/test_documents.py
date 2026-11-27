import asyncio
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
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

from fastapi import HTTPException
from backend.main import get_document


class DocumentServingTests(unittest.TestCase):
    def test_streams_valid_pdf_and_md_inline(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            pdf_path = Path(tmpdir) / "COS30082 Unit Outline.pdf"
            pdf_path.write_bytes(b"%PDF-1.4\n%test")
            md_path = Path(tmpdir) / "outline.md"
            md_path.write_text("# COS30082", encoding="utf-8")

            with patch.dict(os.environ, {"ARCHIVE_DIR": tmpdir}):
                resp_pdf = asyncio.run(get_document("COS30082 Unit Outline.pdf"))
                self.assertEqual(resp_pdf.media_type, "application/pdf")
                self.assertIn("inline", resp_pdf.headers.get("Content-Disposition", ""))

                resp_md = asyncio.run(get_document("outline.md"))
                self.assertTrue(resp_md.media_type.startswith("text/markdown"))
                self.assertIn("inline", resp_md.headers.get("Content-Disposition", ""))

    def test_blocks_path_traversal_with_403_and_missing_with_404(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch.dict(os.environ, {"ARCHIVE_DIR": tmpdir}):
                with self.assertRaises(HTTPException) as ctx_trav:
                    asyncio.run(get_document("../../etc/passwd"))
                self.assertEqual(ctx_trav.exception.status_code, 403)

                with self.assertRaises(HTTPException) as ctx_miss:
                    asyncio.run(get_document("nonexistent.pdf"))
                self.assertEqual(ctx_miss.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
