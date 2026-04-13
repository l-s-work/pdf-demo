from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar('T')


# 分页基础字段。
class PaginationData(BaseModel):
    page: int
    pageSize: int
    total: int


# 统一接口响应结构。
class ApiResponse(BaseModel, Generic[T]):
    code: int = 200
    data: T
    message: str = 'success'
