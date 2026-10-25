from enum import StrEnum


class AiProvider(StrEnum):
    ANTHROPIC = "anthropic"
    NONE = "none"

    def __str__(self) -> str:
        return str(self.value)
