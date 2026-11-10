from __future__ import annotations

import logging
import os
import shutil
import subprocess
from dataclasses import asdict, dataclass
from typing import Any, Dict, Optional
import psutil

logger = logging.getLogger(__name__)


@dataclass
class HardwareProfile:
    total_ram_gb: float
    available_ram_gb: float
    swap_total_gb: float
    cpu_logical_cores: int
    cpu_physical_cores: int
    has_gpu: bool
    gpu_name: Optional[str]
    tier: str  # "low" | "medium" | "high"
    recommended_model: str
    recommended_num_ctx: int
    recommended_num_thread: int
    keep_alive: str
    memory_warning: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class HardwareService:
    """
    Dynamically inspects the host machine environment (RAM, Swap, CPU cores, and GPU)
    to compute safe, optimal runtime parameters (context size, thread concurrency, keep_alive)
    for local LLM execution, preventing system memory exhaustion and OS collapse.
    """

    @staticmethod
    def _detect_gpu() -> tuple[bool, Optional[str]]:
        """Inspects whether an NVIDIA or other acceleration GPU is reachable."""
        # 1. Probe nvidia-smi if available in PATH
        if shutil.which("nvidia-smi"):
            try:
                res = subprocess.run(
                    ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                    capture_output=True,
                    text=True,
                    timeout=1.5,
                )
                if res.returncode == 0 and res.stdout.strip():
                    first_gpu = res.stdout.strip().split("\n")[0].strip()
                    return True, first_gpu
            except Exception as e:
                logger.debug("nvidia-smi probe failed: %s", e)

        # 2. Check PyTorch CUDA if torch is imported
        try:
            import torch

            if torch.cuda.is_available():
                name = (
                    torch.cuda.get_device_name(0)
                    if torch.cuda.device_count() > 0
                    else "CUDA GPU"
                )
                return True, name
        except Exception:
            pass

        return False, None

    @classmethod
    def get_hardware_profile(cls) -> HardwareProfile:
        """
        Dynamically calculates the current machine hardware profile and safe Ollama parameters.
        """
        vmem = psutil.virtual_memory()
        swap = psutil.swap_memory()

        total_ram_gb = round(vmem.total / (1024**3), 2)
        available_ram_gb = round(vmem.available / (1024**3), 2)
        swap_total_gb = round(swap.total / (1024**3), 2)

        cpu_logical = psutil.cpu_count(logical=True) or os.cpu_count() or 4
        cpu_physical = psutil.cpu_count(logical=False) or max(1, cpu_logical // 2)

        has_gpu, gpu_name = cls._detect_gpu()

        # Determine Tier
        # If running CPU-only with no swap, memory is strictly constrained.
        warning: Optional[str] = None
        if swap_total_gb == 0 and total_ram_gb <= 16.0 and not has_gpu:
            warning = (
                f"Host has {total_ram_gb}GB RAM with 0 swap on CPU. "
                "Context window is restricted to 4,096 tokens to prevent out-of-memory lockups."
            )

        if total_ram_gb < 8.0 or (available_ram_gb < 4.0 and swap_total_gb == 0):
            tier = "low"
            recommended_model = "qwen2.5:1.5b"
            recommended_num_ctx = 2048
            recommended_num_thread = max(1, min(3, cpu_physical))
            keep_alive = "2m"
        elif total_ram_gb <= 20.0 and not has_gpu:
            # Matches machines like 14GB/16GB CPU-only without swap
            tier = "medium"
            recommended_model = "qwen2.5:3b"
            # 4096 context keeps KV cache to ~280MB instead of ~4.5GB at 32k
            recommended_num_ctx = 4096
            # Leave at least 2 cores completely free for host OS & browser
            recommended_num_thread = max(
                2, min(8, cpu_physical - 2 if cpu_physical > 4 else cpu_physical)
            )
            keep_alive = "3m"
        else:
            # High tier: either dedicated GPU or > 20GB system RAM
            tier = "high"
            recommended_model = "qwen2.5:7b" if has_gpu else "qwen2.5:3b"
            recommended_num_ctx = 8192 if has_gpu else 4096
            recommended_num_thread = max(4, min(12, cpu_physical))
            keep_alive = "5m"

        return HardwareProfile(
            total_ram_gb=total_ram_gb,
            available_ram_gb=available_ram_gb,
            swap_total_gb=swap_total_gb,
            cpu_logical_cores=cpu_logical,
            cpu_physical_cores=cpu_physical,
            has_gpu=has_gpu,
            gpu_name=gpu_name,
            tier=tier,
            recommended_model=recommended_model,
            recommended_num_ctx=recommended_num_ctx,
            recommended_num_thread=recommended_num_thread,
            keep_alive=keep_alive,
            memory_warning=warning,
        )

    @classmethod
    def check_memory_safety(cls, min_available_gb: float = 1.2) -> tuple[bool, str]:
        """
        Safety check before loading a local model or launching high-context inference.
        Returns (is_safe, message).
        """
        vmem = psutil.virtual_memory()
        swap = psutil.swap_memory()
        avail_gb = vmem.available / (1024**3)
        swap_gb = swap.total / (1024**3)

        if avail_gb < min_available_gb and swap_gb < 1.0:
            return False, (
                f"Critical memory constraint: only {avail_gb:.2f}GB RAM available with no swap. "
                "Local inference halted to protect system stability. Please free host memory or use a cloud model."
            )
        return True, "Memory levels within safe operating thresholds."
