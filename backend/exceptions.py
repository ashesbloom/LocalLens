class OperationAbortedError(Exception):
    """Custom exception for when a user cancels an operation."""

    def __init__(self, message, manifest=None):
        super().__init__(message)
        self.manifest = manifest if manifest is not None else []