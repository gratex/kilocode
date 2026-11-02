/**
 * Shared env-toggle readers for the search tools (glob + grep).
 * Read at the point of use on every call — no module-level environment constants
 * (house rule: build scripts export GTI_* per process, tests flip them per case).
 */

/**
 * GTI_KILO_SYMLINKS — whether the search tools follow symbolic links.
 * Unset / any value except "off": follow shortcuts (Gratex default).
 * "off": upstream behaviour — shortcuts invisible to pattern discovery.
 */
export const followEnabled = (value: string | undefined = process.env.GTI_KILO_SYMLINKS) => value !== "off"