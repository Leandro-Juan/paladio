from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.services.hardware_service import HardwareProfile, HardwareService


def test_hardware_service_detects_system_specs():
    """Verify HardwareService detects actual system profile without errors."""
    profile = HardwareService.get_hardware_profile()
    assert isinstance(profile, HardwareProfile)
    assert profile.total_ram_gb > 0
    assert profile.cpu_logical_cores > 0
    assert profile.tier in ("low", "medium", "high")
    assert profile.recommended_num_ctx in (2048, 4096, 8192, 16384)
    assert profile.recommended_model in ("qwen2.5:1.5b", "qwen2.5:3b", "qwen2.5:7b")


@patch("psutil.virtual_memory")
@patch("psutil.swap_memory")
@patch("psutil.cpu_count")
def test_hardware_service_tier_low(mock_cpu, mock_swap, mock_vmem):
    """Verify constrained low-spec machines (<8GB RAM) receive Tier 1 profile."""
    # 6 GB total RAM, 2 GB available, 0 swap, 4 cores
    mock_vmem.return_value = MagicMock(total=6 * (1024**3), available=2 * (1024**3))
    mock_swap.return_value = MagicMock(total=0)
    mock_cpu.side_effect = lambda logical: 4 if logical else 2

    with patch.object(HardwareService, "_detect_gpu", return_value=(False, None)):
        profile = HardwareService.get_hardware_profile()

    assert profile.tier == "low"
    assert profile.recommended_model == "qwen2.5:1.5b"
    assert profile.recommended_num_ctx == 2048
    assert profile.recommended_num_thread <= 3
    assert profile.keep_alive == "2m"


@patch("psutil.virtual_memory")
@patch("psutil.swap_memory")
@patch("psutil.cpu_count")
def test_hardware_service_tier_medium_no_swap(mock_cpu, mock_swap, mock_vmem):
    """Verify 14GB RAM with 0 swap on CPU receives Tier 2 memory-safe profile."""
    mock_vmem.return_value = MagicMock(total=14.5 * (1024**3), available=10 * (1024**3))
    mock_swap.return_value = MagicMock(total=0)
    mock_cpu.side_effect = lambda logical: 16 if logical else 8

    with patch.object(HardwareService, "_detect_gpu", return_value=(False, None)):
        profile = HardwareService.get_hardware_profile()

    assert profile.tier == "medium"
    assert profile.recommended_model == "qwen2.5:3b"
    assert profile.recommended_num_ctx == 4096
    assert profile.recommended_num_thread == 6
    assert profile.keep_alive == "3m"
    assert profile.memory_warning is not None
    assert "Context window is restricted to 4,096 tokens" in profile.memory_warning


@patch("psutil.virtual_memory")
@patch("psutil.swap_memory")
@patch("psutil.cpu_count")
def test_hardware_service_tier_high_gpu(mock_cpu, mock_swap, mock_vmem):
    """Verify high-spec machine with dedicated GPU receives Tier 3 profile."""
    mock_vmem.return_value = MagicMock(total=32 * (1024**3), available=24 * (1024**3))
    mock_swap.return_value = MagicMock(total=8 * (1024**3))
    mock_cpu.side_effect = lambda logical: 16 if logical else 8

    with patch.object(
        HardwareService, "_detect_gpu", return_value=(True, "NVIDIA RTX 4080")
    ):
        profile = HardwareService.get_hardware_profile()

    assert profile.tier == "high"
    assert profile.recommended_model == "qwen2.5:7b"
    assert profile.recommended_num_ctx == 8192
    assert profile.has_gpu is True
    assert profile.gpu_name == "NVIDIA RTX 4080"


@patch("psutil.virtual_memory")
@patch("psutil.swap_memory")
def test_check_memory_safety(mock_swap, mock_vmem):
    """Verify memory safety triggers on critically low memory without swap."""
    # Critical: 0.8GB available, 0 swap
    mock_vmem.return_value = MagicMock(available=0.8 * (1024**3))
    mock_swap.return_value = MagicMock(total=0)

    is_safe, msg = HardwareService.check_memory_safety(min_available_gb=1.2)
    assert is_safe is False
    assert "Critical memory constraint" in msg

    # Safe: 5GB available
    mock_vmem.return_value = MagicMock(available=5.0 * (1024**3))
    is_safe, msg = HardwareService.check_memory_safety(min_available_gb=1.2)
    assert is_safe is True
