export function DiscoverPagination({
  page,
  count,
  onPage,
}: {
  page: number;
  count: number;
  onPage: (page: number) => void;
}) {
  return (
    <nav className="pagination discover-pagination" aria-label="在线发现分页">
      <button disabled={page === 0} onClick={() => onPage(page - 1)}>
        上一页
      </button>
      <span aria-live="polite" aria-label={`当前第 ${page + 1} 页`}>
        {page + 1}
      </span>
      <button disabled={page >= count - 1} onClick={() => onPage(page + 1)}>
        下一页
      </button>
    </nav>
  );
}
