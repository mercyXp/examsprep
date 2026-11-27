"""Swappable authoring model. Drafts are produced here and saved by the router."""

from app.ai.drafts import DraftBundle, draft_action, provider_info

__all__ = ["DraftBundle", "draft_action", "provider_info"]
