from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.identity_provider import IdentityProvider

T = TypeVar("T", bound="Identity")


@_attrs_define
class Identity:
    """A Google account linked to the signed-in member.

    Attributes:
        created_at (datetime.datetime):
        email (str): The account's address when it was linked.
        id (UUID):
        provider (IdentityProvider):
    """

    created_at: datetime.datetime
    email: str
    id: UUID
    provider: IdentityProvider
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        created_at = self.created_at.isoformat()

        email = self.email

        id = str(self.id)

        provider = self.provider.value

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "createdAt": created_at,
                "email": email,
                "id": id,
                "provider": provider,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        created_at = datetime.datetime.fromisoformat(d.pop("createdAt"))

        email = d.pop("email")

        id = UUID(d.pop("id"))

        provider = IdentityProvider(d.pop("provider"))

        identity = cls(
            created_at=created_at,
            email=email,
            id=id,
            provider=provider,
        )

        identity.additional_properties = d
        return identity

    @property
    def additional_keys(self) -> list[str]:
        return list(self.additional_properties.keys())

    def __getitem__(self, key: str) -> Any:
        return self.additional_properties[key]

    def __setitem__(self, key: str, value: Any) -> None:
        self.additional_properties[key] = value

    def __delitem__(self, key: str) -> None:
        del self.additional_properties[key]

    def __contains__(self, key: str) -> bool:
        return key in self.additional_properties
