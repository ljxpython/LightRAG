import os
import sys
from pathlib import Path
from dotenv import load_dotenv

repo_root = Path(__file__).resolve().parent
sys.path.insert(0, str(repo_root))
load_dotenv(repo_root / ".env")

# Map our .env keys to LightRAG server expected environment variables
os.environ["HOST"] = "0.0.0.0"
os.environ["PORT"] = "9621"
os.environ["DEFAULT_UI"] = "webui"
os.environ["WORKING_DIR"] = str(repo_root / "sandbox_storage" / "eval_benchmark" / "rev_1")
os.environ["INPUT_DIR"] = str(repo_root / "eval_data")

os.environ["LLM_BINDING"] = "openai"
os.environ["LLM_BINDING_HOST"] = os.environ.get("LLM_BASE_URL", "")
os.environ["LLM_BINDING_API_KEY"] = os.environ.get("LLM_API_KEY", "")
os.environ["LLM_MODEL"] = os.environ.get("LLM_MODEL", "deepseek-v4.1-flash")

os.environ["EMBEDDING_BINDING"] = "openai"
os.environ["EMBEDDING_BINDING_HOST"] = os.environ.get("EMBEDDING_BASE_URL", "")
os.environ["EMBEDDING_BINDING_API_KEY"] = os.environ.get("EMBEDDING_API_KEY", "")
os.environ["EMBEDDING_MODEL"] = os.environ.get("EMBEDDING_MODEL", "text-embedding-v4")
os.environ["EMBEDDING_DIM"] = os.environ.get("EMBEDDING_DIM", "1024")

# Set dummy secret to avoid warning
if "TOKEN_SECRET" not in os.environ:
    os.environ["TOKEN_SECRET"] = "secret-token-for-lightrag-webui-testing-123456"

print("Starting LightRAG Official WebUI server on 0.0.0.0:9621...")
from lightrag.api.lightrag_server import main

if __name__ == "__main__":
    main()
