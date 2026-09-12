# merged/

LearnGeo Organizer writes here. No other session writes here.

The Organizer reads every `agents/oy-NN/NOTES.md`, compares the copies each
session dropped, and builds one version that carries the newest good work
from all of them.

What it puts here:

- `index.html`, the combined page.
- Any other combined file, at the same name it has at the top of the repo.
- `DECISIONS.md`, which says, for every place two sessions changed the same
  thing, which one it kept and why. This is the part Owen reads. A merge
  nobody can check is not worth having.

What does not happen here: this folder never goes live on its own. When Owen
is happy with it, the combined files replace the real ones at the top of the
repo in one commit, and that commit is what gets deployed.
