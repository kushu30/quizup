// Every number that decides how strict camera and microphone proctoring is, in one place.
// Tune these here; nothing else in the app hard-codes them.

/** How long a condition must hold before it becomes a flag. */
export const FACE_MISSING_HOLD_MS = 3000;
export const MULTIPLE_FACES_HOLD_MS = 2000;
export const LOOKING_AWAY_HOLD_MS = 4000;
export const CAMERA_BLOCKED_HOLD_MS = 3000;
export const LOUD_AUDIO_HOLD_MS = 2000;

/** While one episode goes on, it counts one more flag this often. */
export const EPISODE_CONTINUE_MS = 30_000;
/** The condition must stay false this long before an episode counts as over. */
export const EPISODE_CLEAR_MS = 3000;
/** After an episode clears, the same condition is ignored this long. */
export const EPISODE_COOLDOWN_MS = 5000;

export const FRAME_INTERVAL_MS = 1000;
export const AUDIO_INTERVAL_MS = 250;
export const AUDIO_CALIBRATION_MS = 5000;

/** Nose offset from the eye midpoint, as a share of the eye distance, above which the head is turned. */
export const TURN_RATIO = 0.45;
/** Eyes closer than this share of the frame width mean a profile view. */
export const PROFILE_EYE_GAP = 0.02;
/** Mean brightness (0 to 255) at or below which the camera counts as blocked. */
export const DARK_BRIGHTNESS_MAX = 12;
/** Sound counts as loud above the room's baseline plus this margin (RMS, 0 to 1), never below the floor. */
export const AUDIO_MARGIN = 0.06;
export const AUDIO_FLOOR = 0.08;

/** The same warning is not shown again for this long (the flag still counts). */
export const WARNING_REPEAT_MS = 30_000;
/** How long a warning stays on screen. */
export const WARNING_VISIBLE_MS = 8000;
