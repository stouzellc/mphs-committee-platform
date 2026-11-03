export class ConflictError extends Error {
  constructor(current) { super('Version conflict'); this.current = current; }
}
export class NotFoundError extends Error {}
// A rule enforced by the storage layer itself (unique key, locked ledger row, append-only audit).
export class ConstraintError extends Error {
  constructor(field, message) { super(message); this.field = field; }
}

export const keyOf = (name) => (name === 'people' ? 'alumniId' : 'id');
export const META_FIELDS = ['version', 'updatedAt', 'updatedBy'];
