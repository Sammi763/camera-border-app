export const parsePort = (value: string | undefined, fallback: number): number => {
  if (value === undefined || !/^\d+$/.test(value)) {
    return fallback
  }
  const port = Number(value)
  return port >= 1 && port <= 65535 ? port : fallback
}
