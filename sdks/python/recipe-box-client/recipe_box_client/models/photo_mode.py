from enum import StrEnum


class PhotoMode(StrEnum):
    DISH = "dish"
    RECIPE = "recipe"

    def __str__(self) -> str:
        return str(self.value)
