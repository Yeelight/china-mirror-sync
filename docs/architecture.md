# Architecture

GitHub is the canonical source. A scheduled workflow discovers public
repositories, creates a platform-specific plan and invokes one isolated matrix
job per target platform. Core modules own discovery, planning, Git leases,
release selection, state and audit. Adapters own only target API mappings.

Git synchronization accepts only heads, tags and notes. Every changed ref uses
`--force-with-lease` against the value observed immediately before the write.
An exactly aligned target is adopted without rewriting it. Any target-side
drift is force-converged to GitHub, including target-only managed refs. Each
write still leases the value observed immediately before the operation, so a
concurrent target change cannot be overwritten blindly.

Machine state is stored on the orphan `mirror-state` branch. Platform jobs
produce isolated state artifacts; one final job merges and publishes them so
parallel target jobs never race while updating the state branch.
