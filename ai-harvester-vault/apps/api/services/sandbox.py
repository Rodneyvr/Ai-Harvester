import asyncio
import os
import tempfile
import uuid
from dataclasses import dataclass
from typing import Optional

from ..core.security import get_encryption_service
from ..services.vault import VaultService
from ..core.database import get_session


@dataclass(slots=True)
class ExecutionResult:
    success: bool
    stdout: str
    stderr: str
    exit_code: int
    execution_time_ms: int


class SandboxService:
    """Execute agent code in isolated subprocess with injected credentials."""

    def __init__(self, session=None):
        self.session = session
        self.vault = VaultService(session) if session else None
        self.crypto = get_encryption_service()
        self._running_processes: dict[str, asyncio.subprocess.Process] = {}

    async def execute_agent(
        self,
        agent_code: str,
        required_keys: list[str],
        language: str = "python",
        timeout: int = 30,
        env_vars: Optional[dict[str, str]] = None,
    ) -> ExecutionResult:
        """Execute agent code with required API keys injected."""
        import time
        start = time.perf_counter()

        # Prepare environment
        env = os.environ.copy()
        if env_vars:
            env.update(env_vars)

        # Inject required credentials from vault
        if self.vault and required_keys:
            for key_name in required_keys:
                # Try to find credential by name or provider
                creds, _ = await self.vault.list(search=key_name, page_size=10)
                for cred in creds:
                    if cred.name.lower() == key_name.lower() or cred.provider.lower() in key_name.lower():
                        reveal = await self.vault.reveal(cred.id)
                        if reveal:
                            env[key_name] = reveal.value
                            break

        # Create temporary file for code
        if language == "python":
            suffix = ".py"
            cmd = ["python", "-u"]
        elif language in ("javascript", "typescript"):
            suffix = ".js" if language == "javascript" else ".ts"
            cmd = ["node"] if language == "javascript" else ["npx", "ts-node"]
        else:
            suffix = ".txt"
            cmd = ["cat"]

        with tempfile.NamedTemporaryFile(mode="w", suffix=suffix, delete=False) as f:
            f.write(agent_code)
            temp_path = f.name

        try:
            cmd.append(temp_path)
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
                cwd=tempfile.gettempdir(),
            )

            # Track process
            process_id = str(uuid.uuid4())
            self._running_processes[process_id] = process

            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=timeout,
                )
                exit_code = process.returncode
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
                stdout, stderr = b"", b"Execution timed out"
                exit_code = -1
            finally:
                self._running_processes.pop(process_id, None)

            execution_time = int((time.perf_counter() - start) * 1000)

            return ExecutionResult(
                success=exit_code == 0,
                stdout=stdout.decode("utf-8", errors="replace") if stdout else "",
                stderr=stderr.decode("utf-8", errors="replace") if stderr else "",
                exit_code=exit_code,
                execution_time_ms=execution_time,
            )

        finally:
            # Cleanup temp file
            try:
                os.unlink(temp_path)
            except OSError:
                pass

    async def execute_streaming(
        self,
        agent_code: str,
        required_keys: list[str],
        language: str = "python",
        timeout: int = 30,
    ):
        """Execute agent and yield output lines in real-time."""
        env = os.environ.copy()

        if self.vault and required_keys:
            for key_name in required_keys:
                creds, _ = await self.vault.list(search=key_name, page_size=10)
                for cred in creds:
                    if cred.name.lower() == key_name.lower():
                        reveal = await self.vault.reveal(cred.id)
                        if reveal:
                            env[key_name] = reveal.value
                            break

        if language == "python":
            suffix = ".py"
            cmd = ["python", "-u"]
        else:
            suffix = ".js"
            cmd = ["node"]

        with tempfile.NamedTemporaryFile(mode="w", suffix=suffix, delete=False) as f:
            f.write(agent_code)
            temp_path = f.name

        try:
            cmd.append(temp_path)
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )

            process_id = str(uuid.uuid4())
            self._running_processes[process_id] = process

            try:
                # Stream stdout
                while True:
                    line = await process.stdout.readline()
                    if not line:
                        break
                    yield {"type": "stdout", "data": line.decode("utf-8", errors="replace")}

                # Stream stderr
                while True:
                    line = await process.stderr.readline()
                    if not line:
                        break
                    yield {"type": "stderr", "data": line.decode("utf-8", errors="replace")}

                await process.wait()
                yield {"type": "exit", "code": process.returncode}

            except Exception as e:
                yield {"type": "error", "data": str(e)}
            finally:
                self._running_processes.pop(process_id, None)

        finally:
            try:
                os.unlink(temp_path)
            except OSError:
                pass

    async def kill_all(self) -> int:
        """Kill all running processes."""
        count = 0
        for process in self._running_processes.values():
            try:
                process.kill()
                count += 1
            except ProcessLookupError:
                pass
        self._running_processes.clear()
        return count