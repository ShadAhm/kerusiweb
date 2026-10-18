---
name: record-decision
description: Record a design decision in docs/decisions.md with the next repo-wide D-number. Use when the maintainer settles a design question (in chat, a planning issue or a PR review), when a planning issue's proposed decisions are agreed, or when asked to "record", "log" or "write down" a decision. Also use when a decision is reversed, to mark the old one superseded.
---

# Record a decision

`docs/decisions.md` is the repository's one decision log. Code comments, specs
and the changelog cite entries by number, e.g. `(D4)`, so numbering is
repo-wide and permanent.

## When to record

Record a decision when the choice shapes behaviour or public surface: an API
shape, a default, a rendering or accessibility rule, a release or scope call.
Don't record implementation details that the code already makes obvious.

Record only what has actually been decided. A proposal still waiting on the
maintainer stays in its planning issue under "Decisions needed". Never write
down an answer the maintainer hasn't given.

## Steps

1. **Read `docs/decisions.md`.** Find the highest `D<n>` in the index. The new
   decision is `D<n+1>`. Several decisions made together take consecutive
   numbers. Never reuse or renumber an existing one.
2. **Find the group.** Decisions are grouped under a `##` heading per planning
   issue or release, e.g. "Seat hover and click (planned for 3.1.0)". Add to
   the matching group, or start a new one with a line naming the source issue
   and the date (`YYYY-MM-DD`, absolute).
3. **Write the entry** in this shape:

   ```markdown
   ### D16. Short imperative title

   - **Status:** Accepted
   - **Source:** [#NN](https://github.com/ShadAhm/kerusiweb/issues/NN)

   What was decided: concrete names (props, outputs, classes, tokens), defaults
   and edge cases, in a short paragraph or a list.

   **Why:** the reason as it stands today. If it was simply the maintainer's
   call, say so ("maintainer's call in #NN") rather than inventing a rationale.
   ```

   - Status is `Accepted` (decided, not shipped), `Shipped in x.y.z`,
     `Superseded by D<m>` or `Rejected`.
   - Use full GitHub URLs for issues and PRs, because a bare `#NN` does not link
     inside a repository file.
   - Name both bindings' spellings when they differ (`onSeatClick` /
     `seatClick`).

4. **Add an index row** in number order. The anchor is GitHub's heading slug:
   lowercase, punctuation dropped, spaces to hyphens. For example,
   `### D14. Read-only maps infer clicks` becomes
   `#d14-read-only-maps-infer-clicks`.
5. **Superseding.** Never edit an old decision's text or reason. Set its status
   to `Superseded by D<m>` (in the entry and the index), and in the new entry
   say what it replaces. Citations of the old number in code should be updated
   to the new one in the same change.
6. **Keep the source in step.** If the decision came from a planning issue, list
   it under that issue's "Decisions" section with its D-number, so the issue and
   the log agree. Ask before editing an issue if the maintainer hasn't already
   asked for issue edits in this conversation.
7. **On release**, flip each shipped decision from `Accepted` to
   `Shipped in x.y.z`, in the entry and in the index.
8. **Format.** Run `npx prettier --write docs/decisions.md` (the repository runs
   `prettier --check .` before a PR).

## Citing a decision

In code, specs and `CHANGELOG.md`, cite the number in parentheses where the
behaviour is implemented or described: `// A hidden section leaves its space
empty (D4).` The changelog entry for a feature cites the decisions it ships.
