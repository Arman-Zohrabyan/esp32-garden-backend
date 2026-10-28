// Server-side voltage calibration for battery readings.
//
// The board sends what its ADC and voltage divider give it (battery_logs
// keep exactly that). A divider built from 5 % resistors is not exactly 1:2,
// so a reading can sit a few percent off the real cell voltage — the pump
// cell read 4.20 V against 4.08 V on a multimeter. Instead of reflashing a
// correction into the firmware, each Battery row carries voltCalib
// (multimeter / board) and every read multiplies by it here.
//
// Stored rows are never rewritten: changing voltCalib re-reads the whole
// history at the new factor, and voltCalib 1 gives back exactly what the
// board sent.

// Li-ion discharge curve, the same one the firmware uses (battery.cpp), so a
// calibrated percentage means the same thing as one computed on the board.
const CURVE: [number, number][] = [
  [4.2, 100], [4.06, 90], [3.98, 80], [3.92, 70],
  [3.87, 60], [3.82, 50], [3.79, 40], [3.75, 30],
  [3.68, 20], [3.5, 10], [3.0, 0],
];

export function percentFromVolt(volts: number): number {
  if (volts >= CURVE[0][0]) return 100;
  if (volts <= CURVE[CURVE.length - 1][0]) return 0;
  for (let i = 0; i < CURVE.length - 1; i++) {
    const [vHi, pHi] = CURVE[i];
    const [vLo, pLo] = CURVE[i + 1];
    if (volts <= vHi && volts >= vLo) {
      return Math.round(pLo + ((volts - vLo) / (vHi - vLo)) * (pHi - pLo));
    }
  }
  return 0;
}

// Allowed range for the factor. A divider off by more than 20 % is a wiring
// fault, not something to calibrate away.
export const CALIB_MIN = 0.8;
export const CALIB_MAX = 1.2;

export function calibrateVolt(volt: number, calib: number): number {
  return Math.round(volt * calib * 1000) / 1000;
}

// One battery log as the dashboard gets it: volt/percentage corrected,
// rawVolt/rawPercentage as the board sent them. With voltCalib 1 the
// board's own percentage is kept as is (it may carry the board's smoothing).
export function calibrateLog<T extends { volt: number; percentage: number }>(
  log: T,
  calib: number,
): T & { rawVolt: number; rawPercentage: number } {
  const rawVolt = log.volt;
  const rawPercentage = log.percentage;
  if (!calib || calib === 1) return { ...log, rawVolt, rawPercentage };
  const volt = calibrateVolt(rawVolt, calib);
  return { ...log, volt, percentage: percentFromVolt(volt), rawVolt, rawPercentage };
}
