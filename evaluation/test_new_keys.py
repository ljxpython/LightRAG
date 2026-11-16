#!/usr/bin/env python3
import os
import httpx
from pathlib import Path

env_file = Path.home() / ".my_best" / ".env"
if not env_file.exists():
    print(f"Error: {env_file} does not exist!")
    exit(1)

env_vars = {}
with open(env_file) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env_vars[k.strip()] = v.strip().strip('\'"')

xiaok_url = env_vars.get('XIAOK_PROXY_URL')
xiaok_key = env_vars.get('XIAOK_PROXY_API_KEY')
xiaok_model = env_vars.get('XIAOK_PROXY_DEFAULT_MODEL', 'deepseek-v4.1-flash')

bailian_url = env_vars.get('BAILIAN_URL')
bailian_key = env_vars.get('BAILIAN_KEY')

print('--- Testing XIAOK LLM ---')
print('URL:', xiaok_url, 'Model:', xiaok_model)
with httpx.Client(timeout=15.0) as client:
    try:
        r = client.post(
            f"{xiaok_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {xiaok_key}", "Content-Type": "application/json"},
            json={"model": xiaok_model, "messages": [{"role": "user", "content": "hi"}], "max_tokens": 10}
        )
        print('LLM Status:', r.status_code)
        if r.status_code == 200:
            print('LLM Response:', r.json()['choices'][0]['message']['content'])
        else:
            print('LLM Error:', r.text)
    except Exception as e:
        print('LLM Exception:', e)

print('--- Testing BAILIAN Embedding ---')
print('URL:', bailian_url)
with httpx.Client(timeout=15.0) as client:
    for emb_m in ['text-embedding-v4', 'text-embedding-v3', 'text-embedding-v2']:
        try:
            r = client.post(
                f"{bailian_url.rstrip('/')}/embeddings",
                headers={"Authorization": f"Bearer {bailian_key}", "Content-Type": "application/json"},
                json={"model": emb_m, "input": ["测试文本"]}
            )
            print(f'Embedding [{emb_m}] Status:', r.status_code)
            if r.status_code == 200:
                print(f"  Success! dim: {len(r.json()['data'][0]['embedding'])}")
                break
            else:
                print(f"  Fail text: {r.text}")
        except Exception as e:
            print(f"  Fail exception: {e}")
