/* ------------------------------------------------------------------
   LearnGeo — mark answers given with god mode on.

   WHAT THIS FILE DOES, in plain words:

     The admin panel has a god mode that makes any answer count as
     correct. That is useful for demonstrating and for testing, but a
     game played with it on would otherwise sit in the class leaderboard
     as a real score, next to a child's name, saying they got everything
     right.

     This adds a yes/no marker to each answer, and to each player, so
     the leaderboard can leave those games out instead of showing
     something untrue about a student.

     It adds two columns and one small automatic rule. It creates no
     tables, deletes nothing, and changes no score, answer or game that
     already exists. Every answer already recorded is marked as not
     assisted, which is what they were.

     Run it the same way as the last one: Supabase dashboard, SQL
     Editor, paste, Run. Safe to run twice, and it undoes itself if
     anything goes wrong.

   ONE HONEST LIMIT, so nobody reads more into this than it does:

     This records the app's own god mode being used. It is not proof
     against someone who edits the JavaScript in their browser to stop
     sending the marker. It catches the thing a student would actually
     reach for, not a determined forger.
-------------------------------------------------------------------*/

begin;

/* ============================ the marker ========================== */

/* On the ANSWER, because god mode can be switched on part way through a
   game. A marker set when someone joins would miss a student who turns
   it on at question four, and that is the case worth catching. */
alter table public.live_answers
  add column if not exists assisted boolean not null default false;

/* And on the PLAYER, so the leaderboard can skip a player in one read.
   totals() already reads this row, so carrying it here costs no extra
   query, and the client is not involved in putting it here. */
alter table public.live_players
  add column if not exists assisted boolean not null default false;

comment on column public.live_answers.assisted is
  'True when the answer was given with the admin god mode on.';
comment on column public.live_players.assisted is
  'True once any of this player''s answers was given with god mode on. Set automatically.';

/* ===================== carrying it to the player ================== */

/* SECURITY DEFINER is doing real work here, the same as in
   is_in_session. A student may write their own answer but has no write
   access to live_players at all, and deliberately so: that is what
   stops anyone editing their own score. The marker still has to reach
   the player row, so the database carries it there itself, under its
   own privileges, rather than anything being relaxed to let a client do
   it.

   Safe from being pointed at someone else: a student can only insert an
   answer whose player row is their own, which the insert policy already
   enforces through can_answer(). So new.player_id is always the
   caller's own player.

   It only ever sets the marker. Nothing here clears it, so an assisted
   game cannot be laundered back into a clean one by a later answer. */
create or replace function private.flag_assisted()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  update public.live_players
     set assisted = true
   where id = new.player_id
     and assisted = false;
  return new;
end $fn$;

revoke all on function private.flag_assisted() from public;

/* Fires on insert and on update, and only for a row that is actually
   marked, so a normal answer never runs it. Update is covered as well
   as insert because the marker becoming true by any route should reach
   the player row; only a teacher can update an answer, and this costs
   nothing when it does not apply. */
drop trigger if exists live_answers_assisted on public.live_answers;
create trigger live_answers_assisted
  after insert or update of assisted on public.live_answers
  for each row when (new.assisted)
  execute function private.flag_assisted();

commit;

/* If you see ERROR above, nothing changed. Send the message on.

   Two things deliberately NOT done here, so nobody adds them later
   thinking they were forgotten:

   No policy was changed. The rule that lets a student write an answer
   still pins correct to false and points to zero, and says nothing
   about this new column, so a student can mark their own answer as
   assisted and still cannot give themselves a score. There is no
   student update policy on either table, which is why a student cannot
   clear the marker once it is set. If a change here ever seems to need
   one of those relaxed, that is the wrong change.
-------------------------------------------------------------------*/
