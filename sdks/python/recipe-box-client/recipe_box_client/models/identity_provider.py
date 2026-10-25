from enum import StrEnum


class IdentityProvider(StrEnum):
    GOOGLE = "google"

    def __str__(self) -> str:
        return str(self.value)
