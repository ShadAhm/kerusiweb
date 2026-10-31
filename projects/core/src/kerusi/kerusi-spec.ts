/**
 * The exact Kerusi standard this library implements: version and draft
 * revision, as the standard's own header gives them.
 *
 * A document cannot say this itself. Its `kerusi` member is `"1.0"` through
 * every 1.0 draft revision (§3, §7; rev 15 in §11), so anything shown to a
 * person about which standard a map follows should name {@link KERUSI_SPEC}
 * instead, never the `kerusi` member alone. Bump it with the conformance
 * corpus (see conformance/README.md).
 */
export const KERUSI_SPEC = {
  /** The standard's version, as its header gives it. */
  version: '1.0.0-draft',
  /** The draft revision of that version. */
  revision: 17,
  /** The version of the standard's published JSON Schemas, e.g. `1.0.0-draft.17`. */
  schemaVersion: '1.0.0-draft.17',
  /** A label for people: "Kerusi v1.0.0-draft, rev 17". */
  label: 'Kerusi v1.0.0-draft, rev 17',
} as const;
