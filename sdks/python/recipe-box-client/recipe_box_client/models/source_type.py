from enum import StrEnum


class SourceType(StrEnum):
    LINK = "link"
    MANUAL = "manual"
    PHOTO = "photo"
    TEXT = "text"

    def __str__(self) -> str:
        return str(self.value)
