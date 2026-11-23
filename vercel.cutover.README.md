# `vercel.cutover.json` — what it is and why

The rationale lives here rather than inside the JSON because **Vercel validates
`vercel.json` against a strict schema and rejects unknown top-level keys**. An
earlier version carried a `"_comment"` array and the deployment failed with
"Deployment failed" pointing at the project-configuration docs — a confusing
message for what is really "you added a key I do not recognise". Do not put
comments in `vercel.json`.

## What it does

Every request to `buima-tracker.vercel.app` is redirected to
`tools.buimaenergy.com`, keeping the path.

## Why it matters for the cutover

Until it is live, the Tracker is reachable at two addresses writing to two
different databases: the Vercel one writes to Supabase, the GCP one writes to
Firestore. Anything uploaded to the old address after the data migration would
be stranded in Supabase.

Deploying this redirect **before** the final migration run is what makes the
cutover seamless rather than a race. Once no UI points at Supabase, the final
run is guaranteed complete instead of depending on nobody having uploaded in
those few minutes.

## Share links keep working

The migration preserved every `share_token`, so

    buima-tracker.vercel.app/share/<token>
 -> tools.buimaenergy.com/share/<token>

is the same site for the same customer. Links already held by clients and
investors keep working; nothing has to be reissued.

## 308, and what it costs

`"permanent": true` emits a 308: cacheable, preserves the method, and we do
intend this to be permanent.

The cost is that **rollback is not instant** for anyone whose browser has
already followed and cached it. If the new site has to be abandoned, roll back
by changing DNS (remove the `tools` CNAME), not by reverting the commit. This
is why the new site is verified end to end before this file is applied.

## Ordering

Vercel evaluates `redirects` before `rewrites`, so the SPA catch-all below the
redirect never sees these requests.
