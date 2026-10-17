#!/usr/bin/env python3
"""One-time migration script to populate initial meta.json for existing storage workspaces."""

from pathlib import Path
import sys

repo_root = Path(__file__).resolve().parent.parent
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

from workspace_manager import TenantWorkspaceManager


KNOWN_PROJECT_NAMES = {
    "11111111-1111-4111-8111-111111111111": {
        "name": "平台默认项目",
        "code": "platform-default",
        "description": "平台全局默认兜底知识库",
    },
    "eval_benchmark": {
        "name": "评测基准 (eval_benchmark)",
        "code": "eval-benchmark",
        "description": "LightRAG 质量评测基准图谱",
    },
    "5a5b7239-43e3-40e6-bba3-e64d96057607": {
        "name": "DearFlow 主线业务项目",
        "code": "dearflow-primary",
        "description": "DearFlow 平台端智能体主线业务图谱",
    },
    "17bc3aa1-5248-4237-874f-ffdcaa327ce5": {
        "name": "业务验证项目 (17bc3aa1)",
        "code": "verification-17bc",
        "description": "平台知识库端到端联调验证项目",
    },
}


def main():
    storage_root = repo_root / "sandbox_storage"
    mgr = TenantWorkspaceManager(storage_root)

    print(f"Scanning storage root: {storage_root}")
    migrated_count = 0

    # 1. Process eval_benchmark legacy path
    eval_dir = storage_root / "eval_benchmark"
    if eval_dir.exists():
        info = KNOWN_PROJECT_NAMES["eval_benchmark"]
        mgr.save_project_meta(
            tenant_id="__default",
            project_id="eval_benchmark",
            name=info["name"],
            code=info["code"],
            description=info["description"],
        )
        migrated_count += 1
        print("Migrated: __default:eval_benchmark -> 评测基准 (eval_benchmark)")

    # 2. Process standard tenant dirs
    for tenant_dir in storage_root.iterdir():
        if not tenant_dir.is_dir() or tenant_dir.name.startswith("."):
            continue
        if tenant_dir.name == "eval_benchmark":
            continue
        tenant_id = tenant_dir.name
        for proj_dir in tenant_dir.iterdir():
            if not proj_dir.is_dir() or proj_dir.name.startswith("."):
                continue
            project_id = proj_dir.name
            meta_path = proj_dir / "meta.json"
            if meta_path.exists():
                print(f"Skipping already initialized: {tenant_id}:{project_id}")
                continue

            info = KNOWN_PROJECT_NAMES.get(project_id, {
                "name": project_id,
                "code": None,
                "description": "",
            })
            mgr.save_project_meta(
                tenant_id=tenant_id,
                project_id=project_id,
                name=info["name"],
                code=info.get("code"),
                description=info.get("description", ""),
            )
            migrated_count += 1
            print(f"Migrated: {tenant_id}:{project_id} -> {info['name']}")

    print(f"\nMigration complete! Total workspaces initialized/updated: {migrated_count}")


if __name__ == "__main__":
    main()
