import pytest
import tempfile
import os
from catalog_manager import CatalogManager

def test_eval_runs_crud_and_migration():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_catalog.db")
        cm = CatalogManager(db_path=db_path)
        
        # 1. 插入一个评测任务
        cm.record_eval_run(
            task_id="task_test_001",
            project_id="proj_alpha",
            dataset_name="rgb_zh_counterfactual.json",
            modes=["mix"],
            top_k=40,
            limit_count=5
        )
        
        runs = cm.list_eval_runs(project_id="proj_alpha")
        assert len(runs) == 1
        assert runs[0]["task_id"] == "task_test_001"
        assert runs[0]["status"] == "running"
        assert runs[0]["progress"] == 10
        assert runs[0]["overall_score"] is None
        
        # 2. 更新评测任务进度与打擂总结
        cm.update_eval_run(
            task_id="task_test_001",
            status="completed",
            progress=100,
            overall_score=0.885,
            pass_rate=0.8,
            metrics_summary={"faithfulness": 0.9, "answer_relevancy": 0.87},
            report_file="deepeval_report_20261116_test.json"
        )
        
        detail = cm.get_eval_run("task_test_001")
        assert detail is not None
        assert detail["status"] == "completed"
        assert detail["progress"] == 100
        assert detail["overall_score"] == 0.885
        assert detail["pass_rate"] == 0.8
        assert detail["metrics_summary"]["faithfulness"] == 0.9
        assert detail["report_file"] == "deepeval_report_20261116_test.json"
        
        # 3. 再次实例化确保 migration 幂等自愈无异常
        cm2 = CatalogManager(db_path=db_path)
        runs2 = cm2.list_eval_runs(project_id="proj_alpha")
        assert len(runs2) == 1
        assert runs2[0]["overall_score"] == 0.885
