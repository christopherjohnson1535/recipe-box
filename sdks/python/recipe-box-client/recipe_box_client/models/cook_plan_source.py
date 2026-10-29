from enum import StrEnum


class CookPlanSource(StrEnum):
    AI = "ai"
    ROUNDROBIN = "roundRobin"

    def __str__(self) -> str:
        return str(self.value)
