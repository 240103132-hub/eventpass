class ApiError(Exception):
    """Business error. Serialized as {"code": ..., "detail": ...} with the given HTTP status."""

    def __init__(self, status: int, code: str, detail: str):
        super().__init__(detail)
        self.status = status
        self.code = code
        self.detail = detail
