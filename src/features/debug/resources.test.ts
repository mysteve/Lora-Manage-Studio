import { describe, expect, it } from 'vitest';
import { resourceSummary, type ResourceSnapshot } from './resources';
const first: ResourceSnapshot = {
  elapsedMs: 1000,
  logicalCpus: 4,
  rootPid: 1,
  skipped: 0,
  processes: [
    { pid: 1, name: 'app', started: '1', cpuMs: 100, workingSet: 200, privateBytes: 300, threads: 5 },
  ],
};
describe('资源统计', () => {
  it('首次只显示内存，不伪造 CPU 值', () => {
    expect(resourceSummary(first, null)).toMatchObject({
      cpu: null,
      workingSet: 200,
      privateBytes: 300,
      threads: 5,
    });
  });
  it('CPU 按时间间隔及逻辑处理器数归一化', () => {
    const next = { ...first, elapsedMs: 3000, processes: [{ ...first.processes[0], cpuMs: 2100 }] };
    expect(resourceSummary(next, first).cpu).toBe(25);
  });
  it('进程 ID 被复用后重新建立基线，不产生错误尖峰', () => {
    const next = {
      ...first,
      elapsedMs: 3000,
      processes: [{ ...first.processes[0], started: '2', cpuMs: 9999 }],
    };
    expect(resourceSummary(next, first).processes[0].cpu).toBeNull();
  });
  it('退出的进程不继续计入内存，非正时间差不计算 CPU', () => {
    expect(resourceSummary({ ...first, processes: [] }, first).workingSet).toBe(0);
    expect(resourceSummary(first, first).cpu).toBeNull();
  });
});
