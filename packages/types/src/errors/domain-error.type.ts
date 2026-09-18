// Shared shape for structured domain errors -- code is a closed union so
// callers can exhaustively switch on it, message is always human-readable,
// cause is an optional stringified underlying error. Kept as a string (not
// unknown/Error) since these shapes often thread toward HTTP response types,
// where a string serializes with no boundary-conversion step.
export type DomainError<Code extends string> = {
  code: Code;
  message: string;
  cause?: string;
};
