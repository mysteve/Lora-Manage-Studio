import { describe, expect, it } from 'vitest';
import { rememberCursors } from './pagination';

describe('在线发现游标页码', () => {
  it('显示下一页并在返回前页时保留后续跳转入口', () => {
    const pages = rememberCursors([null, 'page2'], 1, 'page3');
    expect(pages).toEqual([null, 'page2', 'page3']);
    expect(rememberCursors(pages, 0, 'page2')).toEqual(pages);
  });
  it('游标变化、到达末尾或网站返回重复游标时删除失效的后续记录', () => {
    expect(rememberCursors([null, 'old', 'later'], 0, 'new')).toEqual([null, 'new']);
    expect(rememberCursors([null, 'page2', 'page3'], 1, null)).toEqual([null, 'page2']);
    expect(rememberCursors([null, 'page2'], 1, 'page2')).toEqual([null, 'page2']);
  });
});
