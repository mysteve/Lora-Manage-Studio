export interface ResourceProcess {
  pid: number;
  name: string;
  started: string;
  cpuMs: number;
  workingSet: number;
  privateBytes: number;
  threads: number;
}
export interface ResourceSnapshot {
  elapsedMs: number;
  logicalCpus: number;
  rootPid: number;
  skipped: number;
  processes: ResourceProcess[];
}
export function resourceSummary(current: ResourceSnapshot, previous: ResourceSnapshot | null) {
  const interval = previous ? current.elapsedMs - previous.elapsedMs : 0;
  const cpuReady = !!previous && interval > 0 && current.logicalCpus > 0;
  const before = new Map(previous?.processes.map((p) => [`${p.pid}:${p.started}`, p]));
  const processes = current.processes.map((p) => {
    const old = before.get(`${p.pid}:${p.started}`);
    const cpu =
      cpuReady && old
        ? Math.min(100, (Math.max(0, p.cpuMs - old.cpuMs) / interval / current.logicalCpus) * 100)
        : null;
    return { ...p, cpu };
  });
  return {
    processes,
    cpu: cpuReady
      ? Math.min(
          100,
          processes.reduce((sum, p) => sum + (p.cpu ?? 0), 0),
        )
      : null,
    workingSet: processes.reduce((sum, p) => sum + p.workingSet, 0),
    privateBytes: processes.reduce((sum, p) => sum + p.privateBytes, 0),
    threads: processes.reduce((sum, p) => sum + p.threads, 0),
  };
}
