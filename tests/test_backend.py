import io
import unittest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from api.index import app, MAX_CHARACTERS

client = TestClient(app)

class TestManoramaAPI(unittest.TestCase):
    def test_health_check(self):
        res = client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "healthy")
        self.assertIn("api_key_configured", data)

    def test_extract_txt(self):
        with open("samples/interview_transcript_en.txt", "rb") as f:
            res = client.post("/api/extract", files={"file": ("interview.txt", f, "text/plain")})
        self.assertEqual(res.status_code, 200)
        self.assertIn("50-megawatt distributed floating solar", res.json()["text"])

    def test_extract_docx(self):
        with open("samples/sample_document.docx", "rb") as f:
            res = client.post("/api/extract", files={"file": ("sample.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")})
        self.assertEqual(res.status_code, 200)
        self.assertIn("180 crore", res.json()["text"])

    def test_extract_pdf(self):
        with open("samples/sample_document.pdf", "rb") as f:
            res = client.post("/api/extract", files={"file": ("sample.pdf", f, "application/pdf")})
        self.assertEqual(res.status_code, 200)
        self.assertIn("Kerala Startup Mission", res.json()["text"])

    def test_extract_unsupported_type(self):
        res = client.post("/api/extract", files={"file": ("image.png", b"fake-png-data", "image/png")})
        self.assertEqual(res.status_code, 400)
        self.assertIn("Unsupported file format", res.json()["detail"])

    def test_extract_oversized_text(self):
        huge_text = "A" * (MAX_CHARACTERS + 100)
        res = client.post("/api/extract", files={"file": ("huge.txt", huge_text.encode("utf-8"), "text/plain")})
        self.assertEqual(res.status_code, 400)
        self.assertIn("exceeds the limit", res.json()["detail"])

    def test_extract_scanned_pdf(self):
        # A PDF with 0 extractable text
        empty_page_pdf = (
            b"%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
            b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
            b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >> endobj\n"
            b"xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n"
            b"0000000115 00000 n\ntrailer << /Size 4 /Root 1 0 R >>\nstartxref\n185\n%%EOF"
        )
        res = client.post("/api/extract", files={"file": ("scanned.pdf", empty_page_pdf, "application/pdf")})
        self.assertEqual(res.status_code, 400)
        self.assertIn("Scanned PDF or PDF with no extractable text", res.json()["detail"])

    def test_generate_validation_empty_text(self):
        res = client.post("/api/generate", json={"text": "   ", "targetLanguage": "en"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("cannot be empty", res.json()["detail"])

    def test_generate_validation_invalid_language(self):
        res = client.post("/api/generate", json={"text": "Some text", "targetLanguage": "fr"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("Unsupported target language", res.json()["detail"])

    def test_generate_validation_oversized_text(self):
        huge_text = "A" * (MAX_CHARACTERS + 50)
        res = client.post("/api/generate", json={"text": huge_text, "targetLanguage": "ml"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("exceeds the maximum limit", res.json()["detail"])

    def test_generate_missing_api_key(self):
        with patch.dict("os.environ", {"GEMINI_API_KEY": ""}):
            res = client.post("/api/generate", json={"text": "Hello world", "targetLanguage": "en"})
            self.assertEqual(res.status_code, 500)
            self.assertIn("GEMINI_API_KEY", res.json()["detail"])

    @patch("google.genai.Client")
    def test_generate_successful_structured_output(self, mock_client_cls):
        mock_instance = MagicMock()
        mock_client_cls.return_value = mock_instance
        
        mock_response = MagicMock()
        mock_response.text = (
            '{"headline": "Major 50MW Floating Solar Project Unveiled", '
            '"subheadline": "Rs 180-crore initiative to generate 70 GWh annually", '
            '"body_html": "<p>A breakthrough 50-megawatt distributed floating solar project has been announced...</p>", '
            '"source_notes": ["Location of the reservoir networks was not specified in the source."]}'
        )
        mock_instance.models.generate_content.return_value = mock_response

        with patch.dict("os.environ", {"GEMINI_API_KEY": "test-key-1234"}):
            res = client.post("/api/generate", json={
                "text": "Dr. Menon announced a 50-megawatt floating solar installation.",
                "targetLanguage": "en"
            })
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data["headline"], "Major 50MW Floating Solar Project Unveiled")
            self.assertIn("Rs 180-crore", data["subheadline"])
            self.assertIn("<p>", data["body_html"])
            self.assertEqual(len(data["source_notes"]), 1)
            self.assertIn("Location", data["source_notes"][0])

if __name__ == "__main__":
    unittest.main()

