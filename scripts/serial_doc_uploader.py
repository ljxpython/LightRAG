#!/usr/bin/env python3
import json
import logging
import os
import sys
import time
from pathlib import Path
import requests

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger('serial_uploader')

BASE_URL = 'http://127.0.0.1:9621'
TENANT_ID = 'default'
PROJECT_ID = 'proj_1ld3edpo'
SOURCE_DIR = Path('/home/ubuntu/architecture_source_docs')
STORAGE_DIR = Path('/home/ubuntu/lightrag-v2-exploration/LightRAG/sandbox_storage/default/proj_1ld3edpo/revisions/rev_1')

def get_auth_token():
    r = requests.post(f'{BASE_URL}/login', data={'username': 'admin', 'password': 'admin123456'})
    r.raise_for_status()
    return r.json()['access_token']

def get_doc_status_db():
    p = STORAGE_DIR / 'kv_store_doc_status.json'
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text())
    except Exception as e:
        logger.warning(f'Failed to read doc_status: {e}')
        return {}

def wait_for_doc_completion(target_name: str, max_wait: int = 300) -> str:
    start_time = time.time()
    last_status = 'unknown'
    while time.time() - start_time < max_wait:
        db = get_doc_status_db()
        for did, v in db.items():
            if v.get('file_path') == target_name:
                last_status = v.get('status', 'unknown')
                if last_status in ('processed', 'ready'):
                    return last_status
                if last_status == 'failed':
                    return 'failed'
        time.sleep(4)
    return last_status

def main():
    logger.info('=== Starting Serial Architecture Document Ingestion ===')
    token = get_auth_token()
    headers = {
        'Authorization': f'Bearer {token}',
        'X-Tenant-Id': TENANT_ID,
        'X-Project-Id': PROJECT_ID,
    }

    # Discover all files in source dir
    all_rel_paths = sorted([p.relative_to(SOURCE_DIR) for p in SOURCE_DIR.rglob('*') if p.is_file()])
    logger.info(f'Discovered {len(all_rel_paths)} total source files.')

    # List of files from the first batch that were uploaded with bare names
    first_batch_bare_files = {
        'METHODOLOGY.md', 'README.md',
        '01-system-topology.md', '02-tech-stack.md', '03-design-principles.md',
        'system-topology-interactive.html', 'system-topology.arch.json',
        '01-communication-matrix.md', '02-delegation-auth.md', '03-sse-streaming-pipeline.md',
        '04-trace-and-observability.md', '05-data-isolation.md', '06-knowledge-studio-and-zero-tunnel.md',
        '07-continuous-evaluation-flywheel.md', '08-session-and-runtime-retention-ttl.md',
        '01-architecture.md', '02-chat-session-engine.md', '03-component-design.md',
        '02-runtime-gateway.md', '03-iam-and-governance.md', '04-catalog-management.md',
        '05-token-usage-and-read-models.md'
    }

    # First batch prefix mappings
    first_batch_prefixes = [
        '01-overview/', '02-cross-cutting/', '03-platform-web/',
        '04-platform-api/02-', '04-platform-api/03-', '04-platform-api/04-', '04-platform-api/05-',
        'METHODOLOGY.md', 'README.md'
    ]

    to_process = []
    for rel in all_rel_paths:
        rel_str = str(rel)
        base_name = rel.name
        
        # Check if it was part of first batch
        is_first_batch = any(rel_str.startswith(p) for p in first_batch_prefixes)
        if is_first_batch:
            target_name = base_name
        else:
            # Flatten with __ separator
            target_name = rel_str.replace('/', '__')

        to_process.append((rel, target_name))

    db = get_doc_status_db()
    existing_status = {v.get('file_path'): (did, v.get('status')) for did, v in db.items()}

    logger.info(f'Current DB contains {len(existing_status)} records.')

    # Filter out already processed
    skipped_count = 0
    pending_queue = []
    for rel, target_name in to_process:
        if target_name in existing_status:
            did, st = existing_status[target_name]
            if st in ('processed', 'ready'):
                skipped_count += 1
                continue
            elif st in ('parsing', 'analyzing', 'processing'):
                logger.info(f'[IN-PROGRESS] {target_name} is currently {st}, waiting...')
                st = wait_for_doc_completion(target_name, max_wait=180)
                if st in ('processed', 'ready'):
                    skipped_count += 1
                    continue
        pending_queue.append((rel, target_name))

    logger.info(f'Skipped already processed: {skipped_count}')
    logger.info(f'Queue remaining to upload: {len(pending_queue)}')

    success_count = 0
    failed_count = 0

    for idx, (rel, target_name) in enumerate(pending_queue, 1):
        file_path = SOURCE_DIR / rel
        logger.info(f'[{idx}/{len(pending_queue)}] Uploading: {target_name} ({rel})...')
        
        # Upload
        try:
            with open(file_path, 'rb') as f:
                mime = 'text/html' if target_name.endswith('.html') else ('application/json' if target_name.endswith('.json') else 'text/markdown')
                files = {'file': (target_name, f, mime)}
                r = requests.post(f'{BASE_URL}/documents/upload', headers=headers, files=files, timeout=60)
            
            if r.status_code == 409:
                logger.warning(f'  -> 409 Conflict for {target_name}: already exists or in progress.')
            elif r.status_code != 200:
                logger.error(f'  -> Upload error {r.status_code}: {r.text[:150]}')
            else:
                logger.info(f'  -> Accepted: {r.json().get("status")}')
        except Exception as e:
            logger.error(f'  -> Upload request exception: {e}')

        # Wait for this document to finish processing before taking next
        logger.info(f'  -> Waiting for completion of {target_name}...')
        final_st = wait_for_doc_completion(target_name, max_wait=240)
        logger.info(f'  -> Status for {target_name}: {final_st}')
        
        if final_st in ('processed', 'ready'):
            success_count += 1
        else:
            failed_count += 1

        # Generous cooldown to let the LLM proxy breathe
        time.sleep(3)

    logger.info('=== All queue uploads submitted. Checking failed records... ===')
    db = get_doc_status_db()
    failed_docs = [v.get('file_path') for v in db.values() if v.get('status') == 'failed']
    if failed_docs:
        logger.info(f'Triggering reprocess for {len(failed_docs)} failed documents...')
        try:
            r = requests.post(f'{BASE_URL}/documents/reprocess_failed', headers=headers, timeout=30)
            logger.info(f'Reprocess trigger result: {r.status_code} - {r.text[:100]}')
        except Exception as e:
            logger.warning(f'Reprocess trigger failed: {e}')

    logger.info(f'Done! Successfully processed: {success_count}, Failed: {failed_count}')

if __name__ == '__main__':
    main()
