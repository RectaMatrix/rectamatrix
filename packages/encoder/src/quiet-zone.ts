import { QUIET_ZONE_PROFILES } from "@rectamatrix/core";

export type QuietZoneProfile = keyof typeof QUIET_ZONE_PROFILES;

export interface QuietZoneRenderOptions {
  readonly quietZone?: number;
  readonly quietZoneProfile?: QuietZoneProfile;
}

export function resolveQuietZone(options: QuietZoneRenderOptions = {}): number {
  if (
    options.quietZone !== undefined &&
    options.quietZoneProfile !== undefined
  ) {
    throw new RangeError(
      "Specify either a RectaMatrix Quiet Zone or a Quiet Zone profile, not both.",
    );
  }
  const runtimeProfile: unknown = options.quietZoneProfile;
  if (runtimeProfile !== undefined) {
    if (
      typeof runtimeProfile !== "string" ||
      !Object.hasOwn(QUIET_ZONE_PROFILES, runtimeProfile)
    ) {
      throw new RangeError("Unsupported RectaMatrix Quiet Zone profile.");
    }
    return QUIET_ZONE_PROFILES[runtimeProfile as QuietZoneProfile];
  }
  const quietZone = options.quietZone ?? QUIET_ZONE_PROFILES.standard;
  if (
    !Number.isInteger(quietZone) ||
    (quietZone !== QUIET_ZONE_PROFILES.compact &&
      quietZone < QUIET_ZONE_PROFILES.standard)
  ) {
    throw new RangeError(
      "RectaMatrix Quiet Zone must be two modules for Compact or at least four modules for Standard.",
    );
  }
  return quietZone;
}
