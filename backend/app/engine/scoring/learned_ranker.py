from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import numpy as np

from app.domain.entities.taste import (
    InferredReason,
    TasteEvent,
    TasteSignalType,
    UserTasteProfile,
)
from app.engine.scoring.semantic_learning import SemanticLearningEngine

FEATURE_NAMES: list[str] = [
    "sim_768d",
    "cat_affinity",
    "cat_uncertainty",
    "iconicity",
    "tier_norm",
    "cost_norm",
    "duration_norm",
    "time_of_day_fit",
    "context_fit",
    "is_meal",
    "price_sensitivity_fit",
    "distance_norm",
    "repeat_penalty",
    "group_min_affinity",
]

PRIOR_WEIGHTS = np.array(
    [
        1.20,
        1.40,
        0.25,
        0.70,
        0.50,
        -0.15,
        0.00,
        0.30,
        0.40,
        0.00,
        0.40,
        -0.35,
        -0.80,
        0.60,
    ],
    dtype=np.float64,
)
PRIOR_BIAS: float = -1.20


def _sigmoid(z: np.ndarray) -> np.ndarray:
    z_clip = np.clip(z, -20.0, 20.0)
    return 1.0 / (1.0 + np.exp(-z_clip))


class TasteRankerModel:
    """
    Pure NumPy CPU-only pointwise logistic + pairwise Bradley-Terry preference ranker
    with L2 Bayesian shrinkage toward domain priors for sparse self-hosted deployments.
    """

    @staticmethod
    def build_feature_vector(
        sim_768d: float = 0.5,
        cat_affinity: float = 0.5,
        cat_uncertainty: float = 0.2,
        iconicity: float = 0.5,
        tier: int = 2,
        cost_eur: float = 0.0,
        duration_mins: int = 60,
        time_of_day_fit: float = 0.5,
        context_fit: float = 0.5,
        is_meal: bool = False,
        price_sensitivity: float = 0.5,
        distance_km: float = 1.5,
        repeat_penalty: float = 0.0,
        group_min_affinity: float = 0.5,
    ) -> np.ndarray:
        tier_norm = float(np.clip((5 - int(tier)) / 4.0, 0.0, 1.0))
        cost_norm = float(np.clip(float(cost_eur) / 100.0, 0.0, 1.0))
        dur_norm = float(np.clip(float(duration_mins) / 240.0, 0.0, 1.0))
        price_fit = float(np.clip(1.0 - price_sensitivity * cost_norm, 0.0, 1.0))
        dist_norm = float(np.clip(float(distance_km) / 10.0, 0.0, 1.0))
        return np.array(
            [
                float(np.clip(sim_768d, 0.0, 1.0)),
                float(np.clip(cat_affinity, 0.0, 1.0)),
                float(np.clip(cat_uncertainty, 0.0, 0.5)),
                float(np.clip(iconicity, 0.0, 1.0)),
                tier_norm,
                cost_norm,
                dur_norm,
                float(np.clip(time_of_day_fit, 0.0, 1.0)),
                float(np.clip(context_fit, 0.0, 1.0)),
                1.0 if is_meal else 0.0,
                price_fit,
                dist_norm,
                float(np.clip(repeat_penalty, 0.0, 1.0)),
                float(np.clip(group_min_affinity, 0.0, 1.0)),
            ],
            dtype=np.float64,
        )

    @classmethod
    def _event_to_features(
        cls,
        ev: TasteEvent,
        profile: UserTasteProfile,
        tag_affinities: dict[str, float],
        tag_uncertainties: dict[str, float],
    ) -> np.ndarray:
        ctx = ev.context or {}
        cat = str(ctx.get("category") or "art_culture")
        sim = 0.5
        emb = ctx.get("embedding")
        if (
            emb
            and len(emb) == 768
            and profile.embedding
            and len(profile.embedding) == 768
        ):
            u = SemanticLearningEngine.normalize_vector(profile.embedding)
            p = SemanticLearningEngine.normalize_vector(emb)
            sim = float(np.clip((float(np.dot(u, p)) + 1.0) / 2.0, 0.0, 1.0))

        cat_aff = float(tag_affinities.get(cat, 0.5))
        cat_unc = float(tag_uncertainties.get(cat, 0.2))
        cost_eur = float(ctx.get("cost_eur") or ctx.get("price") or 0.0)
        iconicity = float(ctx.get("iconicity", 0.5))
        tier = int(ctx.get("tier", 2))
        dur = int(ctx.get("duration_mins", 60))
        is_meal = ev.entity_type == "restaurant" or cat == "food_culinary"

        ctx_fit = cat_aff
        for ck in (ctx.get("season"), ctx.get("time_bucket")):
            if (
                ck
                and ck in profile.contextual_profiles
                and cat in profile.contextual_profiles[ck]
            ):
                ctx_fit = profile.contextual_profiles[ck][cat].mean
                break

        tb = ctx.get("time_bucket")
        tod_fit = (
            profile.contextual_profiles[tb][cat].mean
            if (
                tb
                and tb in profile.contextual_profiles
                and cat in profile.contextual_profiles[tb]
            )
            else 0.5
        )

        return cls.build_feature_vector(
            sim_768d=sim,
            cat_affinity=cat_aff,
            cat_uncertainty=cat_unc,
            iconicity=iconicity,
            tier=tier,
            cost_eur=cost_eur,
            duration_mins=dur,
            time_of_day_fit=tod_fit,
            context_fit=ctx_fit,
            is_meal=is_meal,
            price_sensitivity=profile.economic_profile.price_sensitivity,
            distance_km=float(ctx.get("distance_km", 1.5)),
            repeat_penalty=0.0,
            group_min_affinity=cat_aff,
        )

    @classmethod
    def fit(
        cls,
        events: list[TasteEvent],
        profile: UserTasteProfile,
        l2_prior_reg: float = 0.35,
        n_iters: int = 120,
        lr: float = 0.15,
    ) -> dict[str, Any]:
        tag_affinities = profile.get_tag_affinities()
        tag_uncertainties = profile.get_tag_uncertainties()

        X_pts: list[np.ndarray] = []
        y_pts: list[float] = []
        w_pts: list[float] = []

        pos_swaps: dict[tuple[str | None, str], list[np.ndarray]] = {}
        neg_swaps: dict[tuple[str | None, str], list[np.ndarray]] = {}

        for ev in events:
            if ev.entity_type not in ("poi", "restaurant", "category"):
                continue
            if abs(ev.polarity) < 0.2:
                continue
            feat = cls._event_to_features(
                ev, profile, tag_affinities, tag_uncertainties
            )
            label = 1.0 if ev.polarity > 0 else 0.0
            X_pts.append(feat)
            y_pts.append(label)
            w_pts.append(max(0.1, float(ev.weight)))

            cat = str((ev.context or {}).get("category") or "")
            if cat:
                key = (ev.trip_id, cat)
                if ev.event_type == TasteSignalType.STOP_ADDED and ev.polarity > 0.2:
                    pos_swaps.setdefault(key, []).append(feat)
                elif (
                    ev.event_type == TasteSignalType.STOP_REMOVED
                    and ev.inferred_reason == InferredReason.SAME_CATEGORY_SWAP
                ):
                    neg_swaps.setdefault(key, []).append(feat)

        # Pairwise Bradley-Terry difference vectors (x_added - x_removed)
        X_pairs: list[np.ndarray] = []
        for key, pos_list in pos_swaps.items():
            neg_list = neg_swaps.get(key) or []
            for xp in pos_list:
                for xn in neg_list:
                    X_pairs.append(xp - xn)

        n_samples = len(X_pts)
        n_pairs = len(X_pairs)
        w = PRIOR_WEIGHTS.copy()
        b = PRIOR_BIAS

        if n_samples == 0 and n_pairs == 0:
            return {
                "weights": [round(float(v), 5) for v in w],
                "bias": round(float(b), 5),
                "n_samples": 0,
                "n_pairs": 0,
                "feature_names": list(FEATURE_NAMES),
                "trained_at": datetime.now(timezone.utc).isoformat(),
            }

        X_mat = np.stack(X_pts) if n_samples > 0 else np.empty((0, len(FEATURE_NAMES)))
        y_vec = np.asarray(y_pts, dtype=np.float64)
        sample_w = np.asarray(w_pts, dtype=np.float64)
        sw_norm = sample_w / max(float(np.sum(sample_w)), 1.0)
        P_mat = np.stack(X_pairs) if n_pairs > 0 else np.empty((0, len(FEATURE_NAMES)))

        for _ in range(n_iters):
            grad_w = l2_prior_reg * (w - PRIOR_WEIGHTS)
            grad_b = l2_prior_reg * (b - PRIOR_BIAS)

            if n_samples > 0:
                preds = _sigmoid(X_mat @ w + b)
                err = (preds - y_vec) * sw_norm
                grad_w += X_mat.T @ err
                grad_b += float(np.sum(err))

            if n_pairs > 0:
                p_preds = _sigmoid(P_mat @ w)
                p_err = (p_preds - 1.0) / float(n_pairs)
                grad_w += 1.5 * (P_mat.T @ p_err)

            w -= lr * grad_w
            b -= lr * grad_b

        return {
            "weights": [round(float(v), 5) for v in w],
            "bias": round(float(b), 5),
            "n_samples": n_samples,
            "n_pairs": n_pairs,
            "feature_names": list(FEATURE_NAMES),
            "trained_at": datetime.now(timezone.utc).isoformat(),
        }

    @classmethod
    def predict_score(
        cls, features: np.ndarray, ranker_weights: dict[str, Any] | None
    ) -> np.ndarray:
        F = np.asarray(features, dtype=np.float64)
        if F.ndim == 1:
            F = F.reshape(1, -1)
        if F.shape[0] == 0:
            return np.empty(0, dtype=np.float64)

        if ranker_weights and isinstance(ranker_weights.get("weights"), list):
            raw_w = ranker_weights["weights"]
            if len(raw_w) == len(FEATURE_NAMES):
                w = np.asarray(raw_w, dtype=np.float64)
                b = float(ranker_weights.get("bias", PRIOR_BIAS))
            else:
                w = PRIOR_WEIGHTS
                b = PRIOR_BIAS
        else:
            w = PRIOR_WEIGHTS
            b = PRIOR_BIAS

        probs = _sigmoid(F @ w + b)
        return np.clip(probs * 100.0, 0.0, 100.0)
