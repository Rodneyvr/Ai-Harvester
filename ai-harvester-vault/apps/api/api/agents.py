from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_session
from ..schemas import (
    AgentCreate,
    AgentUpdate,
    AgentResponse,
    AgentListResponse,
    SearchRequest,
    SkillResponse,
    ExportRequest,
)
from fastapi.responses import Response
from ..services.agent import AgentService
from ..services.exporter import ExporterService

router = APIRouter(prefix="/agents", tags=["agents"])


async def get_agent_service(session: AsyncSession = Depends(get_session)) -> AgentService:
    return AgentService(session)


async def get_exporter_service(session: AsyncSession = Depends(get_session)) -> ExporterService:
    return ExporterService(session)


@router.post("", response_model=AgentResponse, status_code=201)
async def create_agent(
    data: AgentCreate,
    service: AgentService = Depends(get_agent_service),
):
    """Create a new agent."""
    return await service.create(data)


@router.get("", response_model=AgentListResponse)
async def search_agents(
    query: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    tags: Optional[list[str]] = Query(None),
    min_quality: int = Query(0, ge=0, le=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    service: AgentService = Depends(get_agent_service),
):
    """Search agents with filters."""
    params = SearchRequest(
        query=query,
        platform=platform,
        category=category,
        tags=tags,
        min_quality=min_quality,
        page=page,
        page_size=page_size,
    )
    return await service.search(params)


@router.get("/stats")
async def get_agent_stats(service: AgentService = Depends(get_agent_service)):
    """Get agent statistics."""
    return await service.get_stats()


@router.get("/categories")
async def get_categories(service: AgentService = Depends(get_agent_service)):
    """Get all unique categories."""
    return await service.get_categories()


@router.get("/platforms")
async def get_platforms(service: AgentService = Depends(get_agent_service)):
    """Get all platforms with counts."""
    return await service.get_platforms()


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: UUID,
    service: AgentService = Depends(get_agent_service),
):
    """Get agent by ID."""
    agent = await service.get(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.get("/{agent_id}/detail")
async def get_agent_with_skills(
    agent_id: UUID,
    service: AgentService = Depends(get_agent_service),
):
    """Get agent with its skills."""
    result = await service.get_with_skills(agent_id)
    if not result:
        raise HTTPException(status_code=404, detail="Agent not found")
    return result


@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: UUID,
    data: AgentUpdate,
    service: AgentService = Depends(get_agent_service),
):
    """Update an agent."""
    agent = await service.update(agent_id, data)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(
    agent_id: UUID,
    service: AgentService = Depends(get_agent_service),
):
    """Delete an agent."""
    success = await service.delete(agent_id)
    if not success:
        raise HTTPException(status_code=404, detail="Agent not found")


@router.post("/export")
async def export_agent(
    request: ExportRequest,
    exporter: ExporterService = Depends(get_exporter_service),
):
    """Export agent(s) in specified format."""
    # For now, export first agent
    if not request.agent_ids:
        raise HTTPException(status_code=400, detail="No agent IDs provided")

    # Get first agent (would need session to fetch)
    # This is a simplified version
    raise HTTPException(status_code=501, detail="Export requires session - use /agents/{id}/export/{format}")


@router.get("/{agent_id}/export/{format}")
async def export_single_agent(
    agent_id: UUID,
    format: str,
    include_credentials: bool = False,
    exporter: ExporterService = Depends(get_exporter_service),
    service: AgentService = Depends(get_agent_service),
):
    """Export a single agent in specified format."""
    agent = await service.get(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Need to fetch full agent model for exporter
    from ..models import Agent as AgentModel
    from sqlalchemy import select
    session = exporter.session
    if not session:
        raise HTTPException(status_code=500, detail="Exporter session not available")

    result = await session.execute(select(AgentModel).where(AgentModel.id == agent_id))
    full_agent = result.scalar_one_or_none()
    if not full_agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        result = await exporter.export_agent(full_agent, format, include_credentials)
        return Response(
            content=result.content,
            media_type=result.mime_type,
            headers={"Content-Disposition": f'attachment; filename="{result.filename}"'},
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))