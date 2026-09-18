const UNITS = ["KB", "MB", "GB"];

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} bytes`;

  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < UNITS.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${UNITS[unitIndex]}`;
}
