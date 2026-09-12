# The schema the app actually runs on

Two different backends are described in this repo, and only one of them
is real.

`../migrations/` describes a design that has **never been applied**:
classes keyed on `owner_id`, seats with four states, `submissions` and
`submission_answers` instead of `results`, scores derived server-side,
and three Edge Functions. It is a sketch of where the classroom could
go, not a record of where it is.

This folder is for the live project — the one whose URL is in
`assets/js/cloud.js`. There, the tables are:

| Table | Key columns |
| --- | --- |
| `profiles` | `id`, `display_name`, `role`, `save` (the whole save as jsonb) |
| `classes` | `id`, `code`, `name`, `teacher_id`, `arcade` |
| `class_members` | `class_id`, `student_id`, `display_name` |
| `assignments` | `id` (text), `class_id`, `title`, `mode`, `config` |
| `results` | `class_id`, `assignment_id`, `student_id`, `student_name`, `pct`, `missed` |
| `announcements` | `class_id`, `body`, `pinned` — added by `0001` here |
| `arcade_scores`, `admin_pins` | the arcade and the admin panel |

Authorisation goes through two `security definer` helpers in the
`private` schema, `is_class_teacher(cid)` and `is_class_member(cid)`,
and every policy is written in terms of those rather than of
`profiles.role`.

So: apply the files in **this** folder to the live project. Applying
`../migrations/` on top of it would fail on the first reference to
`owner_id`, and anything written against those table names will not
find them.

Telling the two apart is the whole reason this folder exists. If the
live schema is ever rebuilt to match `../migrations/`, the client in
`assets/js/cloud.js` has to be rewritten in the same change, and this
folder should go away.

## Applying

```bash
supabase link --project-ref <ref>
psql "$DATABASE_URL" -f deployed/0001_announcements.sql
```

Or paste the file into the SQL editor. Every statement is written to be
safe to run twice.
