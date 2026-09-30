"""Settings: config.json (non-secret, committed) + environment (secrets, paths)."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = PROJECT_ROOT / "config.json"
FALLBACK_VAULT = PROJECT_ROOT / "local-vault"


def load_dotenv(path: Path = PROJECT_ROOT / ".env") -> None:
    """Minimal .env reader. Real environment variables always win."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


@dataclass(frozen=True)
class Portfolio:
    id: str
    name: str
    monthly_gbp: float


@dataclass
class Config:
    benchmark: str
    universe: dict[str, str]
    portfolios: list[Portfolio]
    fx_fee_pct: float
    commission_gbp: float
    min_order_usd: float
    non_fractionable: set[str]
    vault_subfolder: str
    vault_path: Path
    vault_is_fallback: bool
    data_dir: Path
    config_path: Path

    @property
    def folder(self) -> Path:
        """The app's folder inside the vault."""
        return self.vault_path / self.vault_subfolder

    @property
    def ledger_path(self) -> Path:
        return self.data_dir / "ledger.json"


def load_config(
    config_path: Path | None = None,
    vault_path: Path | None = None,
    data_dir: Path | None = None,
) -> Config:
    config_path = Path(config_path or os.environ.get("PTRADE_CONFIG") or DEFAULT_CONFIG)
    raw = json.loads(config_path.read_text(encoding="utf-8"))

    env_vault = os.environ.get("OBSIDIAN_VAULT_PATH", "").strip()
    if vault_path is not None:
        vault, fallback = Path(vault_path), False
    elif env_vault:
        vault, fallback = Path(env_vault).expanduser(), False
    else:
        vault, fallback = FALLBACK_VAULT, True

    subfolder = raw.get("vault_subfolder", "Finances/Investments/Paper Trading")
    env_data = os.environ.get("PTRADE_DATA_DIR", "").strip()
    if data_dir is None:
        data_dir = Path(env_data).expanduser() if env_data else vault / subfolder / "data"

    fees = raw.get("fees", {})
    return Config(
        benchmark=raw["benchmark"].upper(),
        universe={k.upper(): v for k, v in raw.get("universe", {}).items()},
        portfolios=[Portfolio(p["id"], p["name"], float(p["monthly_gbp"])) for p in raw["portfolios"]],
        fx_fee_pct=float(fees.get("fx_fee_pct", 0.0)),
        commission_gbp=float(fees.get("commission_gbp", 0.0)),
        min_order_usd=float(fees.get("min_order_usd", 1.0)),
        non_fractionable={t.upper() for t in raw.get("non_fractionable", [])},
        vault_subfolder=subfolder,
        vault_path=vault,
        vault_is_fallback=fallback,
        data_dir=Path(data_dir),
        config_path=config_path,
    )


def save_universe(cfg: Config) -> None:
    """Rewrite only the universe key, keeping the rest of config.json intact."""
    raw = json.loads(cfg.config_path.read_text(encoding="utf-8"))
    raw["universe"] = dict(sorted(cfg.universe.items()))
    cfg.config_path.write_text(json.dumps(raw, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
