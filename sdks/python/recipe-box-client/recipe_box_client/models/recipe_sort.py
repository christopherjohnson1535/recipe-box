from enum import StrEnum


class RecipeSort(StrEnum):
    NEWEST = "newest"
    TIME = "time"
    TITLE = "title"

    def __str__(self) -> str:
        return str(self.value)
