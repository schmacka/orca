// Why: this is the schmacka/orca fork ("Orca Beads"). Gives packaged builds their own app
// name, AppUserModelID, and userData directory so they never share the single-instance
// lock, Keychain safeStorage key, or userData with an installed upstream Orca. Drop this
// file when upstreaming.
export const FORK_APP_NAME = 'Orca Beads'
export const FORK_APP_USER_MODEL_ID = 'dev.porcus3d.orca-beads'
export const FORK_USER_DATA_DIR_NAME = 'Orca Beads'
