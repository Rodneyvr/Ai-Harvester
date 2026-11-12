from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_session
from ..schemas import (
    CredentialCreate,
    CredentialUpdate,
    CredentialResponse,
    CredentialRevealResponse,
)
from ..services.vault import VaultService

router = APIRouter(prefix="/vault", tags=["vault"])


async def get_vault_service(session: AsyncSession = Depends(get_session)) -> VaultService:
    return VaultService(session)


@router.post("/credentials", response_model=CredentialResponse, status_code=201)
async def create_credential(
    data: CredentialCreate,
    vault: VaultService = Depends(get_vault_service),
):
    """Create a new encrypted credential."""
    return await vault.create(data)


@router.get("/credentials", response_model=list[CredentialResponse])
async def list_credentials(
    category: Optional[str] = Query(None),
    environment: Optional[str] = Query(None),
    provider: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    tags: Optional[list[str]] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    vault: VaultService = Depends(get_vault_service),
):
    """List credentials with filters."""
    credentials, total = await vault.list(
        category=category,
        environment=environment,
        provider=provider,
        search=search,
        tags=tags,
        page=page,
        page_size=page_size,
    )
    # Add total count header
    return credentials


@router.get("/credentials/categories")
async def get_categories(vault: VaultService = Depends(get_vault_service)):
    """Get all unique categories."""
    return await vault.get_categories()


@router.get("/credentials/providers")
async def get_providers(vault: VaultService = Depends(get_vault_service)):
    """Get all unique providers."""
    return await vault.get_providers()


@router.get("/credentials/{credential_id}", response_model=CredentialResponse)
async def get_credential(
    credential_id: UUID,
    vault: VaultService = Depends(get_vault_service),
):
    """Get a credential by ID (without decrypted value)."""
    credential = await vault.get(credential_id)
    if not credential:
        raise HTTPException(status_code=404, detail="Credential not found")
    return credential


@router.get("/credentials/{credential_id}/reveal", response_model=CredentialRevealResponse)
async def reveal_credential(
    credential_id: UUID,
    vault: VaultService = Depends(get_vault_service),
):
    """Decrypt and reveal a credential value."""
    credential = await vault.reveal(credential_id)
    if not credential:
        raise HTTPException(status_code=404, detail="Credential not found")
    return credential


@router.patch("/credentials/{credential_id}", response_model=CredentialResponse)
async def update_credential(
    credential_id: UUID,
    data: CredentialUpdate,
    vault: VaultService = Depends(get_vault_service),
):
    """Update a credential."""
    credential = await vault.update(credential_id, data)
    if not credential:
        raise HTTPException(status_code=404, detail="Credential not found")
    return credential


@router.delete("/credentials/{credential_id}", status_code=204)
async def delete_credential(
    credential_id: UUID,
    vault: VaultService = Depends(get_vault_service),
):
    """Delete a credential."""
    success = await vault.delete(credential_id)
    if not success:
        raise HTTPException(status_code=404, detail="Credential not found")


@router.post("/credentials/export")
async def export_credentials(
    credential_ids: Optional[list[UUID]] = None,
    vault: VaultService = Depends(get_vault_service),
):
    """Export selected credentials as .env format."""
    env_content = await vault.export_env(credential_ids)
    return Response(
        content=env_content,
        media_type="text/plain",
        headers={"Content-Disposition": 'attachment; filename="credentials.env"'},
    )