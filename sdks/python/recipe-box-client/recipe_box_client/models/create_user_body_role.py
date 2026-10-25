from enum import StrEnum


class CreateUserBodyRole(StrEnum):
    ADMIN = "admin"
    MEMBER = "member"

    def __str__(self) -> str:
        return str(self.value)
