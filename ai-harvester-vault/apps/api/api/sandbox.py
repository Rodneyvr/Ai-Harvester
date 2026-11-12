from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_session
from ..schemas import HealthCheckRequest
from ..services.sandbox import SandboxService, ExecutionResult
from ..services.health_checker import HealthChecker, HealthCheckResult

router = APIRouter(prefix="/sandbox", tags=["sandbox"])


async def get_sandbox_service(session: AsyncSession = Depends(get_session)) -> SandboxService:
    return SandboxService(session)


async def get_health_checker(session: AsyncSession = Depends(get_session)) -> HealthChecker:
    return HealthChecker(session)


class ExecuteRequest(BaseModel):
    agent_code: str
    required_keys: list[str] = []
    language: str = "python"
    timeout: int = 30
    env_vars: Optional[dict[str, str]] = None


class ExecuteResponse(BaseModel):
    success: bool
    stdout: str
    stderr: str
    exit_code: int
    execution_time_ms: int


@router.post("/execute", response_model=ExecuteResponse)
async def execute_code(
    request: ExecuteRequest,
    sandbox: SandboxService = Depends(get_sandbox_service),
):
    """Execute agent code with injected credentials."""
    result = await sandbox.execute_agent(
        agent_code=request.agent_code,
        required_keys=request.required_keys,
        language=request.language,
        timeout=request.timeout,
        env_vars=request.env_vars,
    )
    return ExecuteResponse(
        success=result.success,
        stdout=result.stdout,
        stderr=result.stderr,
        exit_code=result.exit_code,
        execution_time_ms=result.execution_time_ms,
    )


@router.post("/execute/stream")
async def execute_streaming(
    request: ExecuteRequest,
    sandbox: SandboxService = Depends(get_sandbox_service),
):
    """Execute agent code and stream output in real-time."""
    async def generate():
        async for chunk in sandbox.execute_streaming(
            agent_code=request.agent_code,
            required_keys=request.required_keys,
            language=request.language,
            timeout=request.timeout,
        ):
            yield f"data: {chunk}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/health-check", response_model=list[HealthCheckResult])
async def check_health(
    request: HealthCheckRequest,
    checker: HealthChecker = Depends(get_health_checker),
):
    """Check health of API credentials."""
    if request.credential_ids:
        return await checker.check_multiple(request.credential_ids)
    elif request.provider:
        # Check all credentials for a provider
        # Would need to list and filter
        raise HTTPException(status_code=501, detail="Provider-wide check not yet implemented")
    else:
        return await checker.check_all()


@router.get("/health-check/{credential_id}", response_model=HealthCheckResult)
async def check_single_health(
    credential_id: UUID,
    checker: HealthChecker = Depends(get_health_checker),
):
    """Check health of a single credential."""
    return await checker.check_credential(credential_id)


@router.post("/kill-all")
async def kill_all_processes(sandbox: SandboxService = Depends(get_sandbox_service)):
    """Kill all running sandbox processes."""
    count = await sandbox.kill_all()
    return {"killed": count}