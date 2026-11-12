import re
from dataclasses import dataclass
from typing import Optional

from ..extractor import ExtractionResult
from ..core.config import get_settings


@dataclass(slots=True)
class ScanResult:
    is_safe: bool
    confidence: float
    threats: list[str]
    details: dict


class SecurityScanner:
    """Scan extracted content for malicious code, prompt injection, and unsafe patterns."""

    # Dangerous patterns in code
    DANGEROUS_PATTERNS = [
        # Code execution
        (r"\beval\s*\(", "eval() usage"),
        (r"\bexec\s*\(", "exec() usage"),
        (r"\bcompile\s*\(", "compile() usage"),
        (r"__import__\s*\(", "__import__ usage"),
        (r"importlib\.", "importlib usage"),
        (r"subprocess\.", "subprocess module"),
        (r"os\.system\s*\(", "os.system() usage"),
        (r"os\.popen\s*\(", "os.popen() usage"),
        (r"commands\.", "commands module"),
        # Data exfiltration
        (r"requests\.(get|post|put|delete|patch)\s*\(", "HTTP requests"),
        (r"urllib\.request\.", "urllib requests"),
        (r"httpx\.(get|post|put|delete|patch)\s*\(", "httpx requests"),
        (r"aiohttp\.", "aiohttp usage"),
        (r"socket\.", "socket usage"),
        (r"ftplib\.", "FTP usage"),
        (r"smtplib\.", "SMTP usage"),
        (r"telnetlib\.", "Telnet usage"),
        # Obfuscation
        (r"base64\.(b64decode|decode)\s*\(", "base64 decoding"),
        (r"codecs\.decode\s*\(", "codecs decoding"),
        (r"\\x[0-9a-fA-F]{2}", "hex encoding"),
        (r"chr\s*\(\s*\d+\s*\)", "chr() encoding"),
        # Environment access
        (r"os\.environ", "environment variable access"),
        (r"os\.getenv\s*\(", "os.getenv() usage"),
        (r"dotenv", "dotenv usage"),
        # File system
        (r"open\s*\(", "file open"),
        (r"pathlib\.", "pathlib usage"),
        (r"shutil\.", "shutil usage"),
        (r"glob\.", "glob usage"),
        # Shell
        (r"bash\s*-c", "bash -c"),
        (r"sh\s*-c", "sh -c"),
        (r"cmd\s*/c", "cmd /c"),
        (r"powershell\s*-c", "powershell -c"),
    ]

    # Prompt injection patterns
    INJECTION_PATTERNS = [
        (r"ignore\s+previous\s+instructions", "Ignore previous instructions"),
        (r"disregard\s+(all\s+)?(previous|above)", "Disregard instructions"),
        (r"forget\s+(everything|all\s+previous)", "Forget instructions"),
        (r"you\s+are\s+now\s+(a|an)\s+", "Role change attempt"),
        (r"pretend\s+to\s+be\s+", "Pretend role"),
        (r"act\s+as\s+(a|an)\s+", "Act as role"),
        (r"system\s*:\s*you\s+are", "System prompt injection"),
        (r"<\|.*?\|>", "Special tokens"),
        (r"\[INST\].*?\[/INST\]", "Instruction tags"),
        (r"<<<.*?>>>", "Delimiter injection"),
        (r"###\s*(system|user|assistant)", "Markdown role headers"),
        (r"output\s+(only|just)\s+(the|json|code)", "Output restriction"),
    ]

    def __init__(self):
        self.settings = get_settings()
        self._compiled_dangerous = [(re.compile(p, re.IGNORECASE), desc) for p, desc in self.DANGEROUS_PATTERNS]
        self._compiled_injection = [(re.compile(p, re.IGNORECASE), desc) for p, desc in self.INJECTION_PATTERNS]

    def scan(self, extraction: ExtractionResult) -> ScanResult:
        """Scan extraction result for threats."""
        threats = []
        details = {"code_threats": [], "prompt_threats": [], "suspicious_keys": []}

        # Combine all text content for scanning
        full_text = " ".join(filter(None, [
            extraction.system_prompt or "",
            extraction.tool_code or "",
            extraction.description or "",
        ]))

        # Scan for dangerous code patterns
        for pattern, desc in self._compiled_dangerous:
            matches = pattern.findall(full_text)
            if matches:
                threats.append(f"Code: {desc}")
                details["code_threats"].append({"pattern": desc, "matches": len(matches)})

        # Scan for prompt injection
        if extraction.system_prompt:
            for pattern, desc in self._compiled_injection:
                if pattern.search(extraction.system_prompt):
                    threats.append(f"Prompt Injection: {desc}")
                    details["prompt_threats"].append(desc)

        # Check for suspicious required keys (might be trying to steal keys)
        sensitive_key_patterns = [
            r"private[_-]?key",
            r"secret[_-]?key",
            r"access[_-]?token",
            r"api[_-]?secret",
            r"password",
            r"passwd",
            r"credential",
        ]
        for key in extraction.required_keys or []:
            for pattern in sensitive_key_patterns:
                if re.search(pattern, key, re.IGNORECASE):
                    details["suspicious_keys"].append(key)
                    break

        # Determine safety
        is_safe = len(threats) == 0
        confidence = 1.0 if is_safe else max(0.3, 1.0 - (len(threats) * 0.15))

        return ScanResult(
            is_safe=is_safe,
            confidence=confidence,
            threats=threats,
            details=details,
        )

    async def scan_with_llm(self, extraction: ExtractionResult) -> ScanResult:
        """Enhanced scan using LLM for context-aware analysis."""
        # First do static analysis
        static_result = self.scan(extraction)

        # If static scan finds issues or content is complex, use LLM
        if not static_result.is_safe or (extraction.system_prompt and len(extraction.system_prompt) > 500):
            llm_result = await self._llm_scan(extraction)
            # Combine results - be conservative
            return ScanResult(
                is_safe=static_result.is_safe and llm_result.is_safe,
                confidence=min(static_result.confidence, llm_result.confidence),
                threats=list(set(static_result.threats + llm_result.threats)),
                details={**static_result.details, **llm_result.details},
            )

        return static_result

    async def _llm_scan(self, extraction: ExtractionResult) -> ScanResult:
        """Use LLM to analyze for malicious intent."""
        # This would use the same LLM infrastructure as extractor
        # For now, return static result
        return self.scan(extraction)