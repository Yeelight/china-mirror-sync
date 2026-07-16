# Architecture

GitHub is the canonical source. A scheduled workflow discovers public
repositories, creates a platform-specific plan and invokes one isolated matrix
job per target platform. Core modules own discovery, planning, Git leases,
release selection, state and audit. Adapters own only target API mappings.

Git synchronization accepts only heads, tags and notes. Every changed ref uses
`--force-with-lease` against the value observed immediately before the write.
The first run adopts only an empty or exactly aligned target. Subsequent runs
compare the target with the last successful state and stop on drift.

Machine state is stored on the orphan `mirror-state` branch. Platform jobs
produce isolated state artifacts; one final job merges and publishes them so
parallel target jobs never race while updating the state branch.
