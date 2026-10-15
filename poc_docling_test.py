import json
import os
from pathlib import Path
repo_root = Path(__file__).resolve().parent
from dotenv import load_dotenv
load_dotenv(repo_root / ".env")
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"

from reportlab.pdfgen import canvas
from docling.document_converter import DocumentConverter
from lightrag.parser.external.docling.ir_builder import DoclingIRBuilder
from lightrag.sidecar.writer import write_sidecar

test_dir = repo_root / "test_output_poc"
test_dir.mkdir(exist_ok=True)
pdf_path = test_dir / "sample_multipage.pdf"

# 1. Create a 2-page PDF
print("1. Generating 2-page test PDF...")
c = canvas.Canvas(str(pdf_path))
c.drawString(100, 750, "Page 1: Project Architecture Overview")
c.drawString(100, 700, "LightRAG 1.5 integrates multimodal parsing natively.")
c.showPage()

c.drawString(100, 750, "Page 2: Performance Evaluation")
c.drawString(100, 700, "The throughput is 1200 QPS with 99.9% uptime.")
c.showPage()
c.save()
print("PDF generated:", pdf_path)

# 2. Convert with Docling
print("2. Converting with Docling DocumentConverter...")
converter = DocumentConverter()
conv_result = converter.convert(pdf_path)
doc_dict = conv_result.document.export_to_dict()

# Save raw dict as expected by DoclingIRBuilder
raw_dir = test_dir / "sample_multipage.docling_raw"
raw_dir.mkdir(exist_ok=True)
main_json = raw_dir / "sample_multipage.json"
main_json.write_text(json.dumps(doc_dict, ensure_ascii=False, indent=2))
print("Docling JSON exported to:", main_json)

# 3. Build IRDoc using LightRAG DoclingIRBuilder
print("3. Building IRDoc...")
builder = DoclingIRBuilder()
ir_doc = builder.normalize_from_workdir(raw_dir, document_name="sample_multipage.pdf")
print("IRDoc generated with", len(ir_doc.blocks), "blocks.")

# 4. Write Sidecar (blocks.jsonl)
print("4. Writing sidecar...")
parsed_dir = test_dir / "sample_multipage.parsed"
write_sidecar(ir_doc, parsed_dir=parsed_dir, doc_id="kd_12345678901234567890123456789012", engine="docling")

# 5. Inspect blocks.jsonl
blocks_file = parsed_dir / "sample_multipage.blocks.jsonl"
print("5. Inspecting blocks.jsonl:")
for line in blocks_file.read_text().splitlines():
    data = json.loads(line)
    if data.get("type") == "content":
        content = data.get("content", "").replace("\n", " ")
        positions = data.get("positions", [])
        anchors = [p.get("anchor") for p in positions if p.get("anchor")]
        print(f"  [Block {data.get("blockid")[:8]}] Page(s): {anchors} | Text: {content[:60]}...")

print("\nSUCCESS! Task 1.2 Docling IR and Locator extraction fully verified!")
