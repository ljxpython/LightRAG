#!/usr/bin/env python3
import time
from pathlib import Path

repo_root = Path(__file__).resolve().parent.parent
env_file = repo_root / ".env"

if not env_file.exists():
    print("Error: .env not found in project root!")
    exit(1)

content = env_file.read_text(encoding="utf-8")
backup_file = repo_root / f".env.bak.{int(time.time())}"
backup_file.write_text(content, encoding="utf-8")
print(f"✅ 已备份原始 .env 到: {backup_file.name}")

# Read ~/.my_best/.env
my_best = Path.home() / ".my_best" / ".env"
if not my_best.exists():
    print(f"Error: {my_best} not found!")
    exit(1)

mb_vars = {}
with open(my_best) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            mb_vars[k.strip()] = v.strip().strip("'\"")

xiaok_url = mb_vars.get("XIAOK_PROXY_URL")
xiaok_key = mb_vars.get("XIAOK_PROXY_API_KEY")
xiaok_model = mb_vars.get("XIAOK_PROXY_DEFAULT_MODEL", "deepseek-v4.1-flash")

bailian_url = mb_vars.get("BAILIAN_URL")
bailian_key = mb_vars.get("BAILIAN_KEY")
bailian_model = "text-embedding-v4"

lines = content.splitlines()
new_lines = []
updated = set()

for line in lines:
    if line.startswith("LLM_BASE_URL="):
        new_lines.append(f"LLM_BASE_URL='{xiaok_url}'")
        updated.add("LLM_BASE_URL")
    elif line.startswith("LLM_API_KEY="):
        new_lines.append(f"LLM_API_KEY='{xiaok_key}'")
        updated.add("LLM_API_KEY")
    elif line.startswith("LLM_MODEL="):
        new_lines.append(f"LLM_MODEL='{xiaok_model}'")
        updated.add("LLM_MODEL")
    elif line.startswith("EMBEDDING_BASE_URL="):
        new_lines.append(f"EMBEDDING_BASE_URL='{bailian_url}'")
        updated.add("EMBEDDING_BASE_URL")
    elif line.startswith("EMBEDDING_API_KEY="):
        new_lines.append(f"EMBEDDING_API_KEY='{bailian_key}'")
        updated.add("EMBEDDING_API_KEY")
    elif line.startswith("EMBEDDING_MODEL="):
        new_lines.append(f"EMBEDDING_MODEL='{bailian_model}'")
        updated.add("EMBEDDING_MODEL")
    else:
        new_lines.append(line)

env_file.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
print(f"🎉 成功更新核心环境配置: {sorted(updated)}")
