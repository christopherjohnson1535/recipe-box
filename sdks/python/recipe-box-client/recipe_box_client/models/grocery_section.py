from enum import StrEnum


class GrocerySection(StrEnum):
    FREEZER = "freezer"
    FRIDGE = "fridge"
    MEAT = "meat"
    OTHER = "other"
    PANTRY = "pantry"
    PRODUCE = "produce"

    def __str__(self) -> str:
        return str(self.value)
