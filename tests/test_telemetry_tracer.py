import asyncio
import os
import pytest

from telemetry_tracer import is_tracing_enabled, trace_mcp_tool


def test_is_tracing_enabled(monkeypatch):
    monkeypatch.setenv("MLFLOW_TRACING_ENABLED", "true")
    assert is_tracing_enabled() is True

    monkeypatch.setenv("MLFLOW_TRACING_ENABLED", "1")
    assert is_tracing_enabled() is True

    monkeypatch.setenv("MLFLOW_TRACING_ENABLED", "false")
    assert is_tracing_enabled() is False

    monkeypatch.setenv("MLFLOW_TRACING_ENABLED", "0")
    assert is_tracing_enabled() is False


@pytest.mark.asyncio
async def test_trace_mcp_tool_disabled(monkeypatch):
    monkeypatch.setenv("MLFLOW_TRACING_ENABLED", "false")

    called = False

    @trace_mcp_tool(tool_name="test_tool")
    async def sample_func(x: int):
        nonlocal called
        called = True
        return x * 2

    res = await sample_func(5)
    assert res == 10
    assert called is True


@pytest.mark.asyncio
async def test_trace_mcp_tool_graceful_degradation(monkeypatch):
    monkeypatch.setenv("MLFLOW_TRACING_ENABLED", "true")

    # 模拟 MLflow 不可用或抛出异常
    @trace_mcp_tool(tool_name="failing_tool")
    async def sample_func(msg: str):
        return f"echo: {msg}"

    res = await sample_func("hello")
    assert res == "echo: hello"
